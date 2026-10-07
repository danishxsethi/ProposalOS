#!/bin/bash
#
# canary-deploy.sh - Canary deployment script for Cloud Run with traffic splitting
#
# Usage:
#   ./scripts/canary-deploy.sh --service SERVICE --image IMAGE --region REGION [--rollback]
#
# Canary Stages:
#   1. Deploy new revision (0% traffic initially)
#   2. Set 10% traffic to new revision
#   3. Monitor error rate for 2 minutes
#   4. If healthy, set 50% traffic
#   5. Monitor error rate for 2 minutes
#   6. If healthy, set 100% traffic (complete rollout)
#   7. If any stage fails, automatically rollback to previous revision
#
# Environment Variables:
#   GCP_PROJECT_ID - Your GCP project ID
#   ERROR_RATE_THRESHOLD - Max acceptable error rate (default: 1.0%)
#   MONITORING_WINDOW - Monitoring window in seconds (default: 120)
#

set -euo pipefail

# Default values
SERVICE=""
IMAGE=""
REGION="us-central1"
PROJECT_ID="${GCP_PROJECT_ID:-}"
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-1.0}"
MONITORING_WINDOW="${MONITORING_WINDOW:-120}"
ROLLBACK=false
SKIP_CANARY="${SKIP_CANARY:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
    cat << EOF
Usage: $0 --service SERVICE --image IMAGE [--region REGION] [--rollback]

Options:
    --service SERVICE     Cloud Run service name (required)
    --image IMAGE         Container image to deploy (required)
    --region REGION       GCP region (default: us-central1)
    --rollback            Rollback to previous revision
    --skip-canary         Skip canary stages and deploy directly to 100%
    
Environment Variables:
    GCP_PROJECT_ID        Your GCP project ID (required)
    ERROR_RATE_THRESHOLD  Max acceptable error rate % (default: 1.0)
    MONITORING_WINDOW     Monitoring window in seconds (default: 120)

Examples:
    # Full canary deployment
    ./scripts/canary-deploy.sh --service proposal-engine --image us-central1-docker.pkg.dev/my-project/proposal-engine/proposal-engine:abc123
    
    # Rollback to previous revision
    ./scripts/canary-deploy.sh --service proposal-engine --rollback
    
    # Skip canary (direct 100% deploy)
    ./scripts/canary-deploy.sh --service proposal-engine --image us-central1-docker.pkg.dev/my-project/proposal-engine/proposal-engine:abc123 --skip-canary
EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --service)
            SERVICE="$2"
            shift 2
            ;;
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --skip-canary)
            SKIP_CANARY=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required parameters
if [[ -z "$PROJECT_ID" ]]; then
    log_error "GCP_PROJECT_ID environment variable is required"
    exit 1
fi

if [[ "$ROLLBACK" != "true" && -z "$IMAGE" ]]; then
    log_error "--image is required unless --rollback is specified"
    exit 1
fi

if [[ -z "$SERVICE" ]]; then
    log_error "--service is required"
    exit 1
fi

# Get the current revision
get_current_revision() {
    local revision
    revision=$(gcloud run services describe "$SERVICE" \
        --region "$REGION" \
        --format 'value(status.latestCreatedRevisionName)')
    echo "$revision"
}

# Get the previous revision
get_previous_revision() {
    local revisions
    revisions=$(gcloud run revisions list \
        --service "$SERVICE" \
        --region "$REGION" \
        --format 'value(metadata.name)' \
        --sort-by '~metadata.creationTimestamp' \
        --limit 2)
    
    # Return the second revision (previous one)
    echo "$revisions" | sed -n '2p'
}

# Get traffic split configuration
get_traffic_split() {
    gcloud run services describe "$SERVICE" \
        --region "$REGION" \
        --format 'value(spec.traffic)'
}

# Check error rate for a revision
check_error_rate() {
    local revision="$1"
    local window="$2"
    
    log_info "Checking error rate for revision $revision (last ${window}s)..."
    
    # Query Cloud Monitoring for error rate
    local error_rate
    error_rate=$(gcloud monitoring time-series list \
        --filter="metric.type=\"run.googleapis.com/request_count\" AND resource.label.service_name=\"$SERVICE\" AND metric.response_code=~\"5..\" AND metric.revision=\"$revision\"" \
        --interval="PT${window}S" \
        --format='value(points[0].value.int64Value)' 2>/dev/null || echo "0")
    
    local total_requests
    total_requests=$(gcloud monitoring time-series list \
        --filter="metric.type=\"run.googleapis.com/request_count\" AND resource.label.service_name=\"$SERVICE\" AND metric.revision=\"$revision\"" \
        --interval="PT${window}S" \
        --format='value(points[0].value.int64Value)' 2>/dev/null || echo "1")
    
    if [[ "$total_requests" -eq 0 ]]; then
        total_requests=1
    fi
    
    # Calculate error rate percentage
    local rate
    rate=$(echo "scale=2; ($error_rate * 100) / $total_requests" | bc 2>/dev/null || echo "0")
    
    log_info "Error rate: ${rate}% (threshold: ${ERROR_RATE_THRESHOLD}%)"
    
    # Compare with threshold using bc for floating point
    if (( $(echo "$rate > $ERROR_RATE_THRESHOLD" | bc -l) )); then
        return 1
    fi
    return 0
}

# Check service health
check_health() {
    local service_url
    service_url=$(gcloud run services describe "$SERVICE" \
        --region "$REGION" \
        --format 'value(status.url)')
    
    log_info "Checking service health at $service_url"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "$service_url/api/health" || echo "000")
    
    if [[ "$response" == "200" ]]; then
        log_success "Health check passed"
        return 0
    else
        log_error "Health check failed with status: $response"
        return 1
    fi
}

# Set traffic percentage for a revision
set_traffic() {
    local revision="$1"
    local percentage="$2"
    local prev_revision="$3"
    local prev_percentage=$((100 - percentage))
    
    log_info "Setting traffic: ${revision}=${percentage}%, ${prev_revision}=${prev_percentage}%"
    
    if [[ "$percentage" -eq 100 ]]; then
        gcloud run services update-traffic "$SERVICE" \
            --region "$REGION" \
            --to-latest="$percentage" \
            --quiet
    else
        gcloud run services update-traffic "$SERVICE" \
            --region "$REGION" \
            --to-revisions="$revision=$percentage" \
            --to-revisions="$prev_revision=$prev_percentage" \
            --quiet
    fi
}

# Rollback to previous revision
rollback() {
    log_warning "Initiating rollback..."
    
    local prev_revision
    prev_revision=$(get_previous_revision)
    
    if [[ -z "$prev_revision" ]]; then
        log_error "No previous revision found for rollback"
        exit 1
    fi
    
    log_info "Rolling back to revision: $prev_revision"
    
    set_traffic "$prev_revision" 100 ""
    
    log_success "Rollback complete. Service is now running $prev_revision"
    
    # Send rollback notification
    send_notification "ROLLBACK" "Service $SERVICE rolled back to $prev_revision"
}

# Send notification to Slack
send_notification() {
    local status="$1"
    local message="$2"
    
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color
        case $status in
            "SUCCESS") color="good" ;;
            "ERROR"|"ROLLBACK") color="danger" ;;
            *) color="warning" ;;
        esac
        
        curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{
                \"text\": \"${status}: $SERVICE\",
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"fields\": [
                        {\"title\": \"Service\", \"value\": \"$SERVICE\", \"short\": true},
                        {\"title\": \"Region\", \"value\": \"$REGION\", \"short\": true},
                        {\"title\": \"Message\", \"value\": \"$message\", \"short\": false}
                    ]
                }]
            }" > /dev/null || true
    fi
}

# Main deployment logic
main() {
    log_info "Starting canary deployment for $SERVICE in $REGION"
    log_info "Project: $PROJECT_ID"
    log_info "Image: $IMAGE"
    
    # Get current revision before deployment
    local current_revision
    current_revision=$(get_current_revision)
    log_info "Current revision: $current_revision"
    
    # Handle rollback
    if [[ "$ROLLBACK" == "true" ]]; then
        rollback
        exit 0
    fi
    
    # Step 1: Deploy new revision (0% traffic initially)
    log_info "Deploying new revision (0% traffic)..."
    gcloud run deploy "$SERVICE" \
        --image "$IMAGE" \
        --region "$REGION" \
        --platform managed \
        --no-traffic \
        --quiet
    
    local new_revision
    new_revision=$(get_current_revision)
    log_success "New revision deployed: $new_revision"
    
    # Skip canary if requested
    if [[ "$SKIP_CANARY" == "true" ]]; then
        log_warning "Skipping canary stages..."
        set_traffic "$new_revision" 100
        log_success "Direct deployment complete"
        send_notification "SUCCESS" "Service $SERVICE deployed directly to 100% with $new_revision"
        exit 0
    fi
    
    # Step 2: Set 10% traffic
    log_info "Stage 1/3: Setting 10% traffic to $new_revision"
    set_traffic "$new_revision" 10 "$current_revision"
    
    # Monitor for errors
    sleep 10  # Brief wait for traffic to stabilize
    if ! check_error_rate "$new_revision" "$MONITORING_WINDOW"; then
        log_error "Error rate exceeded threshold at 10% traffic"
        rollback
        exit 1
    fi
    
    if ! check_health; then
        log_error "Health check failed at 10% traffic"
        rollback
        exit 1
    fi
    
    log_success "Stage 1/3 passed: 10% traffic healthy"
    
    # Step 3: Set 50% traffic
    log_info "Stage 2/3: Setting 50% traffic to $new_revision"
    set_traffic "$new_revision" 50 "$current_revision"
    
    sleep "$MONITORING_WINDOW"
    if ! check_error_rate "$new_revision" "$MONITORING_WINDOW"; then
        log_error "Error rate exceeded threshold at 50% traffic"
        rollback
        exit 1
    fi
    
    if ! check_health; then
        log_error "Health check failed at 50% traffic"
        rollback
        exit 1
    fi
    
    log_success "Stage 2/3 passed: 50% traffic healthy"
    
    # Step 4: Set 100% traffic
    log_info "Stage 3/3: Setting 100% traffic to $new_revision"
    set_traffic "$new_revision" 100
    
    sleep 30
    if ! check_error_rate "$new_revision" "$MONITORING_WINDOW"; then
        log_error "Error rate exceeded threshold at 100% traffic"
        rollback
        exit 1
    fi
    
    if ! check_health; then
        log_error "Health check failed at 100% traffic"
        rollback
        exit 1
    fi
    
    log_success "Stage 3/3 passed: 100% traffic healthy"
    log_success "Canary deployment complete! $new_revision is now serving all traffic"
    
    send_notification "SUCCESS" "Service $SERVICE canary deployment completed successfully with $new_revision"
}

# Run main function
main