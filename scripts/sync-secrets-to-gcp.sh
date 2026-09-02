#!/bin/bash
# ============================================
# Sync Secrets to GCP Secret Manager
# ============================================
# This script syncs environment variables from .env.local
# to GCP Secret Manager for production deployments.
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Secret Manager API enabled
# - Permissions: roles/secretmanager.admin
#
# Usage:
#   ./scripts/sync-secrets-to-gcp.sh
#
# ============================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env.local"

# GCP Configuration (update these for your environment)
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GCP_REGION="${GCP_REGION:-us-central1}"

# Secrets to sync (add new secrets here)
SECRETS=(
    "DATABASE_URL"
    "API_KEY"
    "NEXTAUTH_SECRET"
    "ADMIN_SECRET"
    "ADMIN_API_KEY"
    "MASTER_API_KEY"
    "CRON_SECRET"
    "GOOGLE_PAGESPEED_API_KEY"
    "GOOGLE_PLACES_API_KEY"
    "GOOGLE_AI_API_KEY"
    "SERP_API_KEY"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "RESEND_API_KEY"
    "GCS_BUCKET_NAME"
    "WEBHOOK_URL"
    "WEBHOOK_SECRET"
    "ALERT_WEBHOOK_URL"
    "LANGCHAIN_API_KEY"
    "LANGSMITH_API_KEY"
    "LANGSMITH_WORKSPACE_ID"
    "APOLLO_API_KEY"
    "HUNTER_API_KEY"
    "PROXYCURL_API_KEY"
    "CLEARBIT_API_KEY"
    "ZEROBOUNCE_API_KEY"
    "NEVERBOUNCE_API_KEY"
)

# Optional secrets (only sync if present in .env.local)
OPTIONAL_SECRETS=(
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "GOOGLE_APPLICATION_CREDENTIALS"
    "REDIS_URL"
    "OUTREACH_CALENDAR_URL"
    "NEXT_PUBLIC_POSTHOG_KEY"
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
    log_info "Checking prerequisites..."

    # Check gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi

    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
        log_error "Not authenticated with gcloud. Run: gcloud auth login"
        exit 1
    fi

    # Check project is set
    if [ -z "$GCP_PROJECT_ID" ]; then
        GCP_PROJECT_ID=$(gcloud config get-value project)
        if [ -z "$GCP_PROJECT_ID" ]; then
            log_error "GCP_PROJECT_ID not set and no default project configured."
            log_error "Set it via: gcloud config set project YOUR_PROJECT_ID"
            log_error "Or export GCP_PROJECT_ID=YOUR_PROJECT_ID"
            exit 1
        fi
    fi

    log_info "Using GCP Project: ${GCP_PROJECT_ID}"
    log_info "Using GCP Region: ${GCP_REGION}"

    # Check Secret Manager API is enabled
    if ! gcloud services list --enabled --filter="secretmanager.googleapis.com" --format="value(name)" &> /dev/null; then
        log_warning "Secret Manager API not enabled. Enabling..."
        gcloud services enable secretmanager.googleapis.com --project="$GCP_PROJECT_ID"
    fi

    # Check .env.local exists
    if [ ! -f "$ENV_FILE" ]; then
        log_error ".env.local not found at: $ENV_FILE"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

# Get value from .env.local
get_env_value() {
    local key="$1"
    local value=""

    if [ -f "$ENV_FILE" ]; then
        # Read value, handling quotes and empty values
        value=$(grep "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | sed 's/^["'"'"']//;s/["'"'"']$//' | tr -d '\n')
    fi

    echo "$value"
}

# Create or update a secret in Secret Manager
sync_secret() {
    local secret_name="$1"
    local is_optional="${2:-false}"

    local value=$(get_env_value "$secret_name")

    if [ -z "$value" ]; then
        if [ "$is_optional" = "true" ]; then
            log_info "Skipping optional secret: $secret_name (not set)"
            return 0
        else
            log_error "Required secret $secret_name is empty in .env.local"
            return 1
        fi
    fi

    log_info "Syncing secret: $secret_name"

    # Check if secret exists
    if gcloud secrets describe "$secret_name" --project="$GCP_PROJECT_ID" &> /dev/null; then
        # Secret exists, add new version
        echo -n "$value" | gcloud secrets versions add "$secret_name" --data-file=- --project="$GCP_PROJECT_ID"
        log_success "Updated secret: $secret_name"
    else
        # Secret doesn't exist, create it
        echo -n "$value" | gcloud secrets create "$secret_name" --data-file=- --project="$GCP_PROJECT_ID"
        log_success "Created secret: $secret_name"
    fi
}

# Grant Cloud Run service account access to secrets
grant_cloud_run_access() {
    log_info "Granting Cloud Run service account access to secrets..."

    # Get the Cloud Run service account
    # Default format: PROJECT_NUMBER-compute@developer.gserviceaccount.com
    # Or custom: SERVICE_NAME@PROJECT_ID.iam.gserviceaccount.com
    local SERVICE_ACCOUNT="${CLOUD_RUN_SERVICE_ACCOUNT:-}"

    if [ -z "$SERVICE_ACCOUNT" ]; then
        # Try to get the default compute service account
        local PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT_ID" --format="value(projectNumber)")
        SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
    fi

    log_info "Granting access to service account: $SERVICE_ACCOUNT"

    for secret_name in "${SECRETS[@]}"; do
        gcloud secrets add-iam-policy-binding "$secret_name" \
            --project="$GCP_PROJECT_ID" \
            --member="serviceAccount:${SERVICE_ACCOUNT}" \
            --role="roles/secretmanager.secretAccessor" \
            --quiet &> /dev/null || {
            log_warning "Failed to grant access for $secret_name (may already have access)"
        }
    done

    log_success "Service account access granted"
}

# List current secrets
list_secrets() {
    log_info "Current secrets in GCP Secret Manager:"
    gcloud secrets list --project="$GCP_PROJECT_ID" --format="table(name,createTime)"
}

# Main execution
main() {
    echo ""
    echo "============================================"
    echo "  Sync Secrets to GCP Secret Manager"
    echo "============================================"
    echo ""

    check_prerequisites

    echo ""
    log_info "Starting secret sync..."
    echo ""

    local failed=0
    local synced=0

    # Sync required secrets
    for secret_name in "${SECRETS[@]}"; do
        if sync_secret "$secret_name" "false"; then
            ((synced++))
        else
            ((failed++))
        fi
    done

    # Sync optional secrets
    for secret_name in "${OPTIONAL_SECRETS[@]}"; do
        if sync_secret "$secret_name" "true"; then
            ((synced++))
        fi
    done

    echo ""
    log_info "Sync complete!"
    log_success "Successfully synced: $synced secrets"

    if [ $failed -gt 0 ]; then
        log_error "Failed to sync: $failed secrets"
        echo ""
        log_error "Please check the errors above and ensure all required secrets are set in .env.local"
        exit 1
    fi

    # Grant Cloud Run access
    echo ""
    grant_cloud_run_access

    # Show summary
    echo ""
    echo "============================================"
    echo "  Summary"
    echo "============================================"
    echo ""
    log_info "To view secrets: gcloud secrets list --project=$GCP_PROJECT_ID"
    log_info "To view a secret's versions: gcloud secrets versions list SECRET_NAME --project=$GCP_PROJECT_ID"
    log_info "To deploy with secrets: See .env.production.example for --set-secrets format"
    echo ""
    log_success "All secrets synced successfully!"
    echo ""
}

# Show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --project=PROJECT_ID   GCP Project ID (overrides env var)"
    echo "  --region=REGION        GCP Region (default: us-central1)"
    echo "  --list                 List current secrets (don't sync)"
    echo "  --help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0"
    echo "  $0 --project=my-project"
    echo "  $0 --list"
    echo ""
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project=*)
            GCP_PROJECT_ID="${1#*=}"
            shift
            ;;
        --region=*)
            GCP_REGION="${1#*=}"
            shift
            ;;
        --list)
            check_prerequisites
            list_secrets
            exit 0
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main
main