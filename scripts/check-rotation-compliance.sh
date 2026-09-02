#!/bin/bash
# ============================================
# Secret Rotation Compliance Checker
# ============================================
# This script checks if secrets in GCP Secret Manager
# are approaching the 90-day rotation deadline.
#
# Usage:
#   ./scripts/check-rotation-compliance.sh
#
# Exit codes:
#   0 - All secrets compliant (rotated within 90 days)
#   1 - Warning: Some secrets approaching rotation deadline (75-89 days)
#   2 - Critical: Some secrets past rotation deadline (90+ days)
# ============================================

set -euo pipefail

# Configuration
THRESHOLD_WARNING_DAYS=75    # Days before warning
THRESHOLD_CRITICAL_DAYS=90   # Days before critical alert
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Secrets to check (add new production secrets here)
CRITICAL_SECRETS=(
    "DATABASE_URL"
    "API_KEY"
    "NEXTAUTH_SECRET"
    "ADMIN_SECRET"
    "CRON_SECRET"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "RESEND_API_KEY"
    "GOOGLE_AI_API_KEY"
    "GOOGLE_PAGESPEED_API_KEY"
    "GOOGLE_PLACES_API_KEY"
    "SERP_API_KEY"
)

# Functions
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

# Check prerequisites
check_prerequisites() {
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install from: https://cloud.google.com/sdk/docs/install"
        exit 2
    fi

    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 2
    fi

    if [ -z "$GCP_PROJECT_ID" ]; then
        GCP_PROJECT_ID=$(gcloud config get-value project)
        if [ -z "$GCP_PROJECT_ID" ]; then
            log_error "GCP_PROJECT_ID not set and no default project configured."
            log_error "Set it via: gcloud config set project YOUR_PROJECT_ID"
            log_error "Or export GCP_PROJECT_ID=YOUR_PROJECT_ID"
            exit 2
        fi
    fi

    log_info "Checking secrets in project: ${GCP_PROJECT_ID}"
}

# Get secret age in days
get_secret_age_days() {
    local secret_name="$1"
    
    # Get the creation time of the latest version
    local create_time
    create_time=$(gcloud secrets versions describe latest --secret="$secret_name" --project="$GCP_PROJECT_ID" --format="value(createTime)" 2>/dev/null)
    
    if [ -z "$create_time" ]; then
        echo "-1"
        return
    fi
    
    # Convert to epoch seconds
    local create_epoch
    create_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${create_time%%.*}" +%s 2>/dev/null || date -d "${create_time%%.*}" +%s 2>/dev/null)
    
    if [ -z "$create_epoch" ]; then
        echo "-1"
        return
    fi
    
    local now_epoch
    now_epoch=$(date +%s)
    
    # Calculate days old
    local days_old=$(( (now_epoch - create_epoch) / 86400 ))
    echo "$days_old"
}

# Check all secrets
check_secrets() {
    local warning_count=0
    local critical_count=0
    local compliant_count=0
    local missing_count=0
    
    echo ""
    echo "========================================"
    echo "  Secret Rotation Compliance Check"
    echo "========================================"
    echo ""
    echo "Thresholds:"
    echo "  - Warning:  ${THRESHOLD_WARNING_DAYS} days"
    echo "  - Critical: ${THRESHOLD_CRITICAL_DAYS} days"
    echo ""
    echo "Checking ${#CRITICAL_SECRETS[@]} critical secrets..."
    echo ""
    
    printf "%-30s %-12s %-15s %s\n" "SECRET" "AGE (DAYS)" "STATUS" "LAST ROTATED"
    printf "%-30s %-12s %-15s %s\n" "------" "----------" "------" "------------"
    
    for secret_name in "${CRITICAL_SECRETS[@]}"; do
        local days_old
        days_old=$(get_secret_age_days "$secret_name")
        
        if [ "$days_old" -eq -1 ]; then
            printf "%-30s %-12s %-15s %s\n" "$secret_name" "N/A" "MISSING" "-"
            ((missing_count++))
            continue
        fi
        
        local last_rotated
        last_rotated=$(gcloud secrets versions describe latest --secret="$secret_name" --project="$GCP_PROJECT_ID" --format="value(createTime)" 2>/dev/null | cut -d'T' -f1)
        
        local status
        local status_color
        
        if [ "$days_old" -ge "$THRESHOLD_CRITICAL_DAYS" ]; then
            status="CRITICAL"
            status_color="$RED"
            ((critical_count++))
        elif [ "$days_old" -ge "$THRESHOLD_WARNING_DAYS" ]; then
            status="WARNING"
            status_color="$YELLOW"
            ((warning_count++))
        else
            status="COMPLIANT"
            status_color="$GREEN"
            ((compliant_count++))
        fi
        
        printf "%-30s %-12s ${status_color}%-15s${NC} %s\n" "$secret_name" "$days_old" "$status" "$last_rotated"
    done
    
    echo ""
    echo "========================================"
    echo "  Summary"
    echo "========================================"
    echo ""
    log_info "Compliant:  ${compliant_count}/${#CRITICAL_SECRETS[@]}"
    
    if [ $warning_count -gt 0 ]; then
        log_warning "Warning:   ${warning_count}/${#CRITICAL_SECRETS[@]} approaching rotation deadline"
    fi
    
    if [ $critical_count -gt 0 ]; then
        log_error "Critical:   ${critical_count}/${#CRITICAL_SECRETS[@]} past rotation deadline"
    fi
    
    if [ $missing_count -gt 0 ]; then
        log_error "Missing:    ${missing_count}/${#CRITICAL_SECRETS[@]} secrets not found"
    fi
    
    echo ""
    
    # Determine exit code
    if [ $critical_count -gt 0 ]; then
        log_error "RESULT: Rotation compliance FAILED - ${critical_count} secrets need immediate rotation"
        return 2
    elif [ $warning_count -gt 0 ]; then
        log_warning "RESULT: Rotation compliance WARNING - ${warning_count} secrets need rotation soon"
        return 1
    elif [ $missing_count -gt 0 ]; then
        log_error "RESULT: Rotation compliance FAILED - ${missing_count} secrets missing"
        return 2
    else
        log_success "RESULT: All secrets compliant with 90-day rotation policy"
        return 0
    fi
}

# Generate calendar event template for rotation reminder
generate_calendar_reminder() {
    echo ""
    echo "========================================"
    echo "  Calendar Reminder Template"
    echo "========================================"
    echo ""
    echo "To create a rotation reminder, use this template:"
    echo ""
    echo "Event: Secret Rotation Reminder - [SECRET_NAME]"
    echo "When: 75 days from last rotation"
    echo "Description:"
    echo "  Secret: [SECRET_NAME]"
    echo "  Last Rotated: [DATE]"
    echo "  Rotation Due: [DUE_DATE]"
    echo "  "
    echo "  Rotation Steps:"
    echo "  1. Generate new credential"
    echo "  2. Update in GCP Secret Manager"
    echo "  3. Redeploy Cloud Run service"
    echo "  4. Verify functionality"
    echo "  5. Revoke old credential"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    
    local exit_code=0
    check_secrets || exit_code=$?
    
    if [ $exit_code -eq 1 ]; then
        generate_calendar_reminder
    fi
    
    exit $exit_code
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --project=PROJECT_ID   GCP Project ID (overrides env var)"
    echo "  --help                 Show this help message"
    echo ""
    echo "Exit Codes:"
    echo "  0 - All secrets compliant"
    echo "  1 - Warning: secrets approaching rotation deadline"
    echo "  2 - Critical: secrets past rotation deadline or missing"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --project=my-project"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project=*)
            GCP_PROJECT_ID="${1#*=}"
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 2
            ;;
    esac
done

# Run main
main