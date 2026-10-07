#!/usr/bin/env bash
#
# Claraud.com — Deploy to GCP Cloud Run
# Uses existing Docker image from Artifact Registry and deploys to Cloud Run.
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
REGION="${REGION:-us-central1}"           # GCP region (us-central1, europe-west1, etc.)
PROJECT_ID="${PROJECT_ID:-proposal-487522}"  # GCP project ID (default: proposal-487522)
IMAGE_NAME="claraud"
SERVICE_NAME="claraud-web"

# =============================================================================
# Step 1: Validate configuration
# =============================================================================
if [ -z "$PROJECT_ID" ]; then
  echo "❌ Error: PROJECT_ID is required."
  echo "   Set it: export PROJECT_ID=your-gcp-project-id"
  echo "   Or pass: PROJECT_ID=myproject ./deploy.sh"
  exit 1
fi

# =============================================================================
# Step 2: Configure Docker for Artifact Registry
# =============================================================================
echo "🔐 Configuring Docker for Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# =============================================================================
# Step 3: Use existing image from Artifact Registry
# =============================================================================
# Use the image that was already pushed to claraud repository
EXISTING_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${IMAGE_NAME}/${SERVICE_NAME}:latest"
echo "🏗️  Deploying Claraud.com to Cloud Run"
echo "   Project:  ${PROJECT_ID}"
echo "   Region:   ${REGION}"
echo "   Image:    ${EXISTING_IMAGE}"
echo ""

# Verify the image exists
echo "📦 Verifying image exists in Artifact Registry..."
if ! gcloud container images describe "${EXISTING_IMAGE}" --project="${PROJECT_ID}" --format="value(image_summary.digest)" >/dev/null 2>&1; then
  echo "❌ Error: Image not found at ${EXISTING_IMAGE}"
  echo "   Please push the image first with:"
  echo "   docker tag claraud-web:latest ${EXISTING_IMAGE}"
  echo "   docker push ${EXISTING_IMAGE}"
  exit 1
fi
echo "   ✅ Image verified"

# =============================================================================
# Step 4: Deploy to Cloud Run
# =============================================================================
echo ""
echo "🚀 Deploying to Cloud Run..."

# App URL for emails, redirects (Cloud Run URL)
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)' 2>/dev/null || echo "")
APP_URL="https://${SERVICE_NAME}-${PROJECT_NUMBER}.${REGION}.run.app"
if [ -z "$PROJECT_NUMBER" ]; then
  APP_URL="https://${SERVICE_NAME}.run.app"
fi

# Env vars (non-secret)
ENV_VARS="NODE_ENV=production,GCP_PROJECT_ID=${PROJECT_ID},GCP_REGION=${REGION},BASE_URL=${APP_URL},NEXT_PUBLIC_APP_URL=${APP_URL},NEXTAUTH_URL=${APP_URL},NEXT_PUBLIC_BASE_URL=${APP_URL}"

# Secrets from Secret Manager (optional - for production data)
# Run ./setup-secrets.sh first to create these secrets
# For now, we'll use mock data, so secrets are optional
SECRETS=""

DEPLOY_ARGS=(
  --image "${EXISTING_IMAGE}"
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --platform managed
  --allow-unauthenticated
  --memory 1Gi
  --cpu 1
  --min-instances 0
  --max-instances 10
  --port 3000
  --set-env-vars="${ENV_VARS}"
  --set-secrets="${SECRETS}"
)

gcloud run deploy "${SERVICE_NAME}" "${DEPLOY_ARGS[@]}"

echo ""
echo "✅ Deploy complete!"
echo "   Service URL: $(gcloud run services describe ${SERVICE_NAME} --project ${PROJECT_ID} --region ${REGION} --format 'value(status.url)' 2>/dev/null || echo 'Run: gcloud run services describe claraud-web --project ${PROJECT_ID} --region ${REGION} --format \"value(status.url)\"')"