#!/usr/bin/env bash
#
# ProposalOS — Local deploy to GCP Cloud Run
# Builds Docker image, pushes to Artifact Registry, deploys to Cloud Run.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Docker running
#   - Artifact Registry API enabled
#   - Cloud Run API enabled
#
# Usage:
#   ./deploy.sh                    # Uses REGION and PROJECT_ID from env or below
#   REGION=europe-west1 ./deploy.sh
#

set -e

# =============================================================================
# CONFIGURATION — Fill in or set via environment variables
# =============================================================================
REGION="${REGION:-us-central1}"           # GCP region (e.g. us-central1, europe-west1)
PROJECT_ID="${PROJECT_ID:-}"              # GCP project ID (required)
IMAGE_NAME="proposal-engine/app"
SERVICE_NAME="proposal-engine"

# Cloud SQL (required for production)
# Set DATABASE_URL to Cloud SQL connection string. Format:
#   postgresql://USER:PASSWORD@/DB_NAME?host=/cloudsql/PROJECT:REGION:INSTANCE
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:proposal-db}"
DATABASE_URL="${DATABASE_URL:-}"         # Must be set for Cloud SQL (e.g. from .env.production or Secret Manager)

# =============================================================================
# Step 1: Validate configuration
# =============================================================================
if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID is required."
  echo "   Set it: export PROJECT_ID=your-gcp-project-id"
  echo "   Or pass: PROJECT_ID=myproject ./deploy.sh"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  Warning: DATABASE_URL not set. Using DATABASE_URL from Secret Manager."
  echo "   Ensure DATABASE_URL secret exists: gcloud secrets describe DATABASE_URL --project=${PROJECT_ID}"
  USE_DATABASE_SECRET=1
else
  USE_DATABASE_SECRET=0
fi

# Get commit SHA for tagging (or use 'latest' if not in a git repo)
COMMIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"
FULL_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_NAME}:${COMMIT_SHA}"

echo "📦 Deploying ProposalOS to Cloud Run"
echo "   Project:  ${PROJECT_ID}"
echo "   Region:   ${REGION}"
echo "   Image:    ${FULL_IMAGE}"
echo ""

# =============================================================================
# Step 2: Configure Docker for Artifact Registry
# =============================================================================
echo "🔐 Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# =============================================================================
# Step 3: Build the Docker image
# =============================================================================
echo ""
echo "🏗️  Building Docker image (linux/amd64 for Cloud Run)..."
docker build --platform linux/amd64 -t "${FULL_IMAGE}" .

# =============================================================================
# Step 4: Push to Artifact Registry
# =============================================================================
echo ""
echo "📤 Pushing image to Artifact Registry..."
docker push "${FULL_IMAGE}"

# =============================================================================
# Step 5: Deploy to Cloud Run
# =============================================================================
# Add --set-secrets and --set-env-vars for production. Example:
#   --set-secrets="DATABASE_URL=DATABASE_URL:latest,API_KEY=API_KEY:latest,..."
#   --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},..."
#   --add-cloudsql-instances=PROJECT:REGION:INSTANCE  # if using Cloud SQL
echo ""
echo "🚀 Deploying to Cloud Run..."

# App URL for emails, redirects (Cloud Run URL)
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)' 2>/dev/null || echo "")
APP_URL="https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app"
if [ -z "$PROJECT_NUMBER" ]; then
  APP_URL="https://${SERVICE_NAME}.run.app"
fi

# Env vars (non-secret). DATABASE_URL from Secret Manager when using Cloud SQL or when unset.
ENV_VARS="GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},BASE_URL=${APP_URL},NEXT_PUBLIC_APP_URL=${APP_URL},NEXTAUTH_URL=${APP_URL},NEXT_PUBLIC_BASE_URL=${APP_URL}"
if [ -n "$DATABASE_URL" ] && [[ "${DATABASE_URL}" != *"/cloudsql/"* ]]; then
  ENV_VARS="${ENV_VARS},DATABASE_URL=${DATABASE_URL}"
fi

# Secrets from Secret Manager (run ./scripts/sync-secrets-to-gcp.sh first)
SECRETS="API_KEY=API_KEY:latest,GOOGLE_PAGESPEED_API_KEY=GOOGLE_PAGESPEED_API_KEY:latest,GOOGLE_PLACES_API_KEY=GOOGLE_PLACES_API_KEY:latest,SERP_API_KEY=SERP_API_KEY:latest,GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest,RESEND_API_KEY=RESEND_API_KEY:latest"
if [ -n "$USE_DATABASE_SECRET" ] && [ "$USE_DATABASE_SECRET" = "1" ] || [[ "${DATABASE_URL:-}" == *"/cloudsql/"* ]]; then
  SECRETS="${SECRETS},DATABASE_URL=DATABASE_URL:latest"
fi

DEPLOY_ARGS=(
  --image "${FULL_IMAGE}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --platform managed
  --allow-unauthenticated
  --memory 1Gi
  --cpu 1
  --min-instances 0
  --max-instances 5
  --port 8080
  --set-env-vars="${ENV_VARS}"
  --set-secrets="${SECRETS}"
)

# Add Cloud SQL connection when DATABASE_URL uses /cloudsql/ socket or when using secret
if [[ "${DATABASE_URL:-}" == *"/cloudsql/"* ]] || [ "${USE_DATABASE_SECRET:-0}" = "1" ]; then
  echo "   Using Cloud SQL: ${CLOUD_SQL_INSTANCE}"
  DEPLOY_ARGS+=(--add-cloudsql-instances="${CLOUD_SQL_INSTANCE}")
fi

gcloud run deploy "${SERVICE_NAME}" "${DEPLOY_ARGS[@]}"

echo ""
echo "✅ Deploy complete!"
echo "   Service URL: $(gcloud run services describe ${SERVICE_NAME} --project ${PROJECT_ID} --region ${REGION} --format 'value(status.url)' 2>/dev/null || echo 'Run: gcloud run services describe proposal-engine --project '"${PROJECT_ID}"' --region '"${REGION}"' --format \"value(status.url)\"')"
