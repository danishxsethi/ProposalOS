#!/bin/bash

# Setup GCP Cloud Scheduler Jobs for Autonomous Pipeline
# 
# Prerequisites:
# 1. gcloud CLI installed and authenticated
# 2. Cloud Scheduler API enabled
# 3. Service deployed to Cloud Run
# 4. CRON_SECRET environment variable set
#
# Usage: ./scripts/setup-cron-jobs.sh [SERVICE_URL]
# Example: ./scripts/setup-cron-jobs.sh https://proposal-engine-abc123.run.app

set -e

# Configuration
PROJECT_ID="proposal"
REGION="us-central1"

# Get SERVICE_URL from argument or try to fetch from Cloud Run
if [ -z "$1" ]; then
  echo "🔍 Fetching Cloud Run service URL..."
  SERVICE_URL=$(gcloud run services describe proposal-engine \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format='value(status.url)' 2>/dev/null || echo "")
  
  if [ -z "$SERVICE_URL" ]; then
    echo "❌ Error: Could not find Cloud Run service 'proposal-engine'"
    echo ""
    echo "Usage: ./scripts/setup-cron-jobs.sh [SERVICE_URL]"
    echo "Example: ./scripts/setup-cron-jobs.sh https://proposal-engine-abc123.run.app"
    exit 1
  fi
else
  SERVICE_URL="$1"
fi

CRON_SECRET="${CRON_SECRET:-autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333}"

echo "🚀 Setting up Cloud Scheduler jobs for Autonomous Pipeline"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service URL: ${SERVICE_URL}"
echo ""

# Function to create or update a cron job
create_cron_job() {
  local JOB_NAME=$1
  local SCHEDULE=$2
  local ENDPOINT=$3
  local DESCRIPTION=$4
  
  echo "📅 Setting up: ${JOB_NAME}"
  
  # Check if job exists
  if gcloud scheduler jobs describe ${JOB_NAME} --location=${REGION} --project=${PROJECT_ID} &>/dev/null; then
    echo "   Updating existing job..."
    gcloud scheduler jobs update http ${JOB_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --schedule="${SCHEDULE}" \
      --uri="${SERVICE_URL}${ENDPOINT}" \
      --http-method=POST \
      --headers="Authorization=Bearer ${CRON_SECRET}" \
      --time-zone="America/New_York" \
      --description="${DESCRIPTION}" \
      --quiet
  else
    echo "   Creating new job..."
    gcloud scheduler jobs create http ${JOB_NAME} \
      --location=${REGION} \
      --project=${PROJECT_ID} \
      --schedule="${SCHEDULE}" \
      --uri="${SERVICE_URL}${ENDPOINT}" \
      --http-method=POST \
      --headers="Authorization=Bearer ${CRON_SECRET}" \
      --time-zone="America/New_York" \
      --description="${DESCRIPTION}" \
      --quiet
  fi
  
  echo "   ✅ ${JOB_NAME} configured"
  echo ""
}

# Create all cron jobs
echo "Creating cron jobs..."
echo ""

# 1. Discovery - Every 6 hours
create_cron_job \
  "pipeline-discovery" \
  "0 */6 * * *" \
  "/api/cron/discovery" \
  "Discover new prospects from external sources"

# 2. Pipeline Audit - Every 2 hours
create_cron_job \
  "pipeline-audit" \
  "0 */2 * * *" \
  "/api/cron/pipeline-audit" \
  "Process discovered prospects through audit pipeline"

# 3. Pipeline Outreach - Every hour
create_cron_job \
  "pipeline-outreach" \
  "0 * * * *" \
  "/api/cron/pipeline-outreach" \
  "Send outreach emails to proposed prospects"

# 4. Signal Detection - Daily at 2 AM
create_cron_job \
  "pipeline-signal-detection" \
  "0 2 * * *" \
  "/api/cron/signal-detection" \
  "Detect business signals for optimal outreach timing"

# 5. Pipeline Closing - Every 4 hours
create_cron_job \
  "pipeline-closing" \
  "0 */4 * * *" \
  "/api/cron/pipeline-closing" \
  "Process hot leads and manage checkout sessions"

# 6. Pipeline Delivery - Daily at 8 AM
create_cron_job \
  "pipeline-delivery" \
  "0 8 * * *" \
  "/api/cron/pipeline-delivery" \
  "Process delivery tasks and check for overdue items"

echo "✅ All cron jobs configured successfully!"
echo ""
echo "📋 To view all jobs:"
echo "   gcloud scheduler jobs list --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "🧪 To test a job manually:"
echo "   gcloud scheduler jobs run pipeline-discovery --location=${REGION} --project=${PROJECT_ID}"
echo ""
echo "📊 To view job execution logs:"
echo "   gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=proposal-engine\" --limit=50 --project=${PROJECT_ID}"
echo ""
echo "⚠️  Note: Jobs for partner-matching and intelligence-aggregation are not created yet."
echo "   Create them when Tasks 26 and 27 are implemented."
echo ""
echo "✨ Pipeline is now automated! Cron jobs will run on schedule."
