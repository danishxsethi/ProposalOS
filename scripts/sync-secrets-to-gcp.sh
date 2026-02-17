#!/usr/bin/env bash
#
# ProposalOS — Sync .env.local to GCP Secret Manager
# Creates or updates secrets so Cloud Run can use them.
#
# Usage:
#   ./scripts/sync-secrets-to-gcp.sh
#   PROJECT_ID=proposal-487522 ./scripts/sync-secrets-to-gcp.sh
#

set -e

PROJECT_ID="${PROJECT_ID:-proposal-487522}"
ENV_FILE="${ENV_FILE:-.env.local}"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: $ENV_FILE not found"
  exit 1
fi

# Parse KEY=value (ignore comments, handle values with =)
get_var() {
  grep -E "^${1}=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r' | head -1
}

echo "🔐 Syncing secrets from $ENV_FILE to Secret Manager (project: $PROJECT_ID)"
echo ""

# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID" --quiet 2>/dev/null || true

# Secrets to sync (name in GCP = name in .env.local)
SECRET_NAMES=(
  API_KEY
  GOOGLE_PAGESPEED_API_KEY
  GOOGLE_PLACES_API_KEY
  GOOGLE_AI_API_KEY
  SERP_API_KEY
  RESEND_API_KEY
  LANGCHAIN_API_KEY
)

for name in "${SECRET_NAMES[@]}"; do
  val=$(get_var "$name")
  if [ -z "$val" ]; then
    echo "   ⏭️  $name: not set in $ENV_FILE, skipping"
    continue
  fi
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$val" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID" --quiet
    echo "   ✅ $name: updated"
  else
    echo -n "$val" | gcloud secrets create "$name" --data-file=- --project="$PROJECT_ID" --replication-policy=automatic --quiet
    echo "   ✅ $name: created"
  fi
done

# Grant Cloud Run service account access
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo ""
echo "🔑 Granting Cloud Run service account access to secrets..."
for name in "${SECRET_NAMES[@]}"; do
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    gcloud secrets add-iam-policy-binding "$name" \
      --member="serviceAccount:${SA}" \
      --role="roles/secretmanager.secretAccessor" \
      --project="$PROJECT_ID" \
      --quiet 2>/dev/null || true
  fi
done

echo ""
echo "✅ Secrets synced. Deploy with: PROJECT_ID=$PROJECT_ID ./deploy.sh"
