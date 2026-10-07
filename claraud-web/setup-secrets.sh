#!/usr/bin/env bash
#
# setup-secrets.sh — Create secrets in GCP Secret Manager for Claraud.com
#
# Run this once to create all required secrets before the first deploy.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - PROJECT_ID set or passed as argument
#
# Usage:
#   ./setup-secrets.sh                    # Uses PROJECT_ID from env or below
#   PROJECT_ID=myproject ./setup-secrets.sh
#

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================
PROJECT_ID="${PROJECT_ID:-proposal-487522}"  # GCP project ID

# =============================================================================
# SECRETS TO CREATE
# =============================================================================
SECRETS=(
    "claraud-api-url"
    "claraud-api-key"
    "claraud-resend-key"
    "claraud-nextauth-secret"
    "claraud-stripe-secret"
    "claraud-stripe-webhook-secret"
    "claraud-posthog-key"
    "claraud-database-url"
    "claraud-google-ai-key"
    "claraud-google-places-key"
)

# =============================================================================
# MAIN SCRIPT
# =============================================================================
echo "🔐 Setting up GCP Secret Manager for Claraud.com"
echo "   Project: ${PROJECT_ID}"
echo ""

# Create each secret
for secret in "${SECRETS[@]}"; do
    echo "Creating secret: ${secret}"
    
    # Create the secret (ignore error if it already exists)
    if gcloud secrets create "$secret" \
        --project="$PROJECT_ID" \
        --replication-policy="automatic" 2>/dev/null; then
        echo "  ✅ Created"
    else
        echo "  ⚠️  Already exists (skipping creation)"
    fi
    
    # Prompt for value
    echo -n "  Enter value for ${secret}: "
    read -s value
    echo ""
    
    # Add version to the secret
    if echo -n "$value" | gcloud secrets versions add "$secret" --data-file=- --project="$PROJECT_ID"; then
        echo "  ✅ Value set"
    else
        echo "  ❌ Failed to set value"
    fi
    
    echo ""
done

echo "🔑 All secrets configured!"
echo ""
echo "Next steps:"
echo "  1. Run ./deploy.sh to deploy Claraud.com"
echo "  2. Visit the service URL to verify the app is running"
echo ""