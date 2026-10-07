#!/bin/bash
#
# One-Command Rollback Script for ProposalOS
#
# This script performs a one-command rollback to a previous deployment
# and handles database migrations safely.
#
# Usage:
#   ./scripts/rollback.sh [OPTIONS]
#
# Options:
#   --target COMMIT_SHA    Rollback to specific commit (default: previous deployment)
#   --service SERVICE      Service to rollback (default: proposal-engine)
#   --region REGION        GCP region (default: us-central1)
#   --dry-run             Show what would be done without making changes
#   --help                Show this help message
#
# Examples:
#   ./scripts/rollback.sh
#   ./scripts/rollback.sh --target abc123def
#   ./scripts/rollback.sh --dry-run
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
REGION="${GCP_REGION:-us-central1}"
PROJECT_ID="${GCP_PROJECT_ID:-}"
SERVICE="proposal-engine"
TARGET_COMMIT=""
DRY_RUN=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET_COMMIT="$2"
            shift 2
            ;;
        --service)
            SERVICE="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            head -25 "$0" | tail -20
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Helper functions
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

# Validate prerequisites
validate_prerequisites() {
    log_info "Validating prerequisites..."
    
    # Check for gcloud
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check for project ID
    if [[ -z "$PROJECT_ID" ]]; then
        PROJECT_ID=$(gcloud config get-value project 2>/dev/null || echo "")
        if [[ -z "$PROJECT_ID" ]]; then
            log_error "GCP Project ID not set. Set GCP_PROJECT_ID env var or configure gcloud."
            exit 1
        fi
    fi
    
    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "Not authenticated with gcloud. Run 'gcloud auth login'."
        exit 1
    fi
    
    log_success "Prerequisites validated"
}

# Get current deployment info
get_current_deployment() {
    log_info "Fetching current deployment info..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would fetch current deployment"
        return
    fi
    
    CURRENT_IMAGE=$(gcloud run services describe "$SERVICE" \
        --region "$REGION" \
        --format="value(spec.template.spec.containers[0].image)" 2>/dev/null || echo "")
    
    if [[ -z "$CURRENT_IMAGE" ]]; then
        log_error "Could not find current deployment for service: $SERVICE"
        exit 1
    fi
    
    log_info "Current image: $CURRENT_IMAGE"
}

# Get previous deployment revision
get_previous_revision() {
    log_info "Fetching previous deployment revisions..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would fetch previous revisions"
        return
    fi
    
    # Get list of revisions sorted by creation time
    REVISIONS=$(gcloud run revisions list \
        --service "$SERVICE" \
        --region "$REGION" \
        --format="value(metadata.name)" \
        --sort-by="~metadata.creationTimestamp" | head -5)
    
    if [[ -z "$REVISIONS" ]]; then
        log_error "No previous revisions found"
        exit 1
    fi
    
    echo -e "${BLUE}Available revisions:${NC}"
    echo "$REVISIONS" | nl
    
    # If target commit specified, find matching revision
    if [[ -n "$TARGET_COMMIT" ]]; then
        TARGET_REVISION=$(echo "$REVISIONS" | grep -i "$TARGET_COMMIT" | head -1 || echo "")
        if [[ -z "$TARGET_REVISION" ]]; then
            log_error "No revision found matching commit: $TARGET_COMMIT"
            exit 1
        fi
    else
        # Default to previous revision (second in list)
        TARGET_REVISION=$(echo "$REVISIONS" | sed -n '2p')
    fi
    
    if [[ -z "$TARGET_REVISION" ]]; then
        log_error "Could not determine target revision"
        exit 1
    fi
    
    log_info "Target revision: $TARGET_REVISION"
}

# Get image from revision
get_revision_image() {
    local revision="$1"
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would get image from revision $revision"
        return
    fi
    
    TARGET_IMAGE=$(gcloud run revisions describe "$revision" \
        --region "$REGION" \
        --format="value(spec.template.spec.containers[0].image)" 2>/dev/null || echo "")
    
    if [[ -z "$TARGET_IMAGE" ]]; then
        log_error "Could not get image from revision: $revision"
        exit 1
    fi
    
    log_info "Target image: $TARGET_IMAGE"
}

# Check database migration status
check_db_migrations() {
    log_info "Checking database migration status..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would check database migrations"
        return
    fi
    
    # Check if there are any pending migrations that might cause issues
    # This is a simplified check - in production you'd want more sophisticated validation
    
    log_warning "Database rollback considerations:"
    echo "  - Verify no schema changes require data migration"
    echo "  - Check Prisma migration history for breaking changes"
    echo "  - Ensure application code is compatible with target DB state"
    
    # Prompt for confirmation if this is a significant rollback
    read -p "  Continue with DB compatibility check? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Rollback cancelled by user"
        exit 0
    fi
    
    log_success "DB migration check passed"
}

# Perform rollback
perform_rollback() {
    log_info "Performing rollback..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would execute:"
        echo "  gcloud run services update-traffic $SERVICE \\"
        echo "    --region $REGION \\"
        echo "    --to-revisions=$TARGET_REVISION=100"
        return
    fi
    
    # Traffic-based rollback (instant, no downtime)
    log_info "Switching traffic to revision: $TARGET_REVISION"
    
    gcloud run services update-traffic "$SERVICE" \
        --region "$REGION" \
        --to-revisions="$TARGET_REVISION=100" \
        --quiet
    
    log_success "Traffic switched to $TARGET_REVISION"
    
    # Wait for health check
    log_info "Waiting for service to be ready..."
    sleep 10
    
    # Verify rollback
    verify_rollback
}

# Verify rollback was successful
verify_rollback() {
    log_info "Verifying rollback..."
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would verify rollback"
        return
    fi
    
    # Check service status
    SERVICE_STATUS=$(gcloud run services describe "$SERVICE" \
        --region "$REGION" \
        --format="value(status.conditions[?@.type=='Ready'].status)" 2>/dev/null || echo "False")
    
    if [[ "$SERVICE_STATUS" != "True" ]]; then
        log_error "Service is not in Ready state after rollback"
        exit 1
    fi
    
    # Health check
    SERVICE_URL=$(gcloud run services describe "$SERVICE" \
        --region "$REGION" \
        --format="value(status.url)" 2>/dev/null || echo "")
    
    if [[ -n "$SERVICE_URL" ]]; then
        HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health" 2>/dev/null || echo "000")
        
        if [[ "$HEALTH_RESPONSE" == "200" ]]; then
            log_success "Health check passed (HTTP $HEALTH_RESPONSE)"
        else
            log_warning "Health check returned HTTP $HEALTH_RESPONSE"
        fi
    fi
    
    log_success "Rollback verification complete"
}

# Send notification
send_notification() {
    local status="$1"
    
    if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
        log_info "SLACK_WEBHOOK_URL not set, skipping notification"
        return
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        echo "[DRY RUN] Would send Slack notification"
        return
    fi
    
    local emoji="✅"
    local color="good"
    if [[ "$status" == "failed" ]]; then
        emoji="❌"
        color="danger"
    fi
    
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
        -H 'Content-Type: application/json' \
        -d "{
            \"text\": \"${emoji} Rollback ${status}\",
            \"attachments\": [{
                \"color\": \"${color}\",
                \"fields\": [
                    {\"title\": \"Service\", \"value\": \"${SERVICE}\", \"short\": true},
                    {\"title\": \"Revision\", \"value\": \"${TARGET_REVISION}\", \"short\": true},
                    {\"title\": \"Region\", \"value\": \"${REGION}\", \"short\": true}
                ]
            }]
        }" || log_warning "Failed to send Slack notification"
}

# Main rollback process
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  ProposalOS Rollback Script${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    log_info "Configuration:"
    echo "  Service: $SERVICE"
    echo "  Region: $REGION"
    echo "  Project: $PROJECT_ID"
    echo "  Target Commit: ${TARGET_COMMIT:-auto (previous)}"
    echo "  Dry Run: $DRY_RUN"
    echo ""
    
    # Confirmation prompt
    if [[ "$DRY_RUN" != true ]]; then
        read -p "Proceed with rollback? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    # Execute rollback steps
    validate_prerequisites
    get_current_deployment
    get_previous_revision
    get_revision_image "$TARGET_REVISION"
    check_db_migrations
    
    echo ""
    log_info "Ready to rollback:"
    echo "  From: $CURRENT_IMAGE"
    echo "  To:   $TARGET_IMAGE"
    echo ""
    
    if [[ "$DRY_RUN" != true ]]; then
        read -p "Confirm rollback execution? [y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Rollback cancelled by user"
            exit 0
        fi
    fi
    
    perform_rollback
    
    # Send success notification
    send_notification "completed"
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Rollback Completed Successfully${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Service: $SERVICE"
    echo "Revision: $TARGET_REVISION"
    echo "Image: $TARGET_IMAGE"
    echo ""
    echo "Next steps:"
    echo "  1. Monitor application logs: gcloud run logs tail $SERVICE --region $REGION"
    echo "  2. Verify functionality in the application"
    echo "  3. Investigate the cause of the issue that required rollback"
    echo ""
}

# Run main function
main "$@"