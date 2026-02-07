#!/bin/bash
set -e

# Configuration
SERVICE_NAME="proposal-engine"
REGION="us-central1"
REPO_NAME="proposal-engine"
PROJECT_ID=$(gcloud config get-value project)

echo "🚀 Setting up GCP environment for $SERVICE_NAME in $PROJECT_ID..."

# 1. Enable Services
echo "Encabling required services..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  compute.googleapis.com

# 2. Create Artifact Registry
echo "Creating Artifact Registry repo..."
if ! gcloud artifacts repositories describe $REPO_NAME --location=$REGION --project=$PROJECT_ID > /dev/null 2>&1; then
    gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for ProposalOS"
else
    echo "Repository $REPO_NAME already exists."
fi

# 3. Setup Secrets
echo "Setting up Secrets..."
# Helper function to create/update secret
setup_secret() {
    local key=$1
    local value=$2
    
    if [ -z "$value" ]; then
        echo "⚠️ Skipping $key (no value provided)"
        return
    fi
    
    # Create secret if not exists
    if ! gcloud secrets describe $key --project=$PROJECT_ID > /dev/null 2>&1; then
        gcloud secrets create $key --replication-policy="automatic" --project=$PROJECT_ID
    fi
    
    # Add version
    echo -n "$value" | gcloud secrets versions add $key --data-file=- --project=$PROJECT_ID
    echo "✅ Secret $key updated."
}

# Read from .env.local if available, otherwise .env
if [ -f .env.local ]; then
    echo "Loading secrets from .env.local..."
    export $(grep -v '^#' .env.local | xargs)
elif [ -f .env ]; then
    echo "Loading secrets from .env..."
    export $(grep -v '^#' .env | xargs)
fi

# Prompt for missing secrets (simple interactive check or rely on env)
# For automation, we assume they are in env or .env
setup_secret "DATABASE_URL" "$DATABASE_URL"
setup_secret "GOOGLE_PLACES_API_KEY" "$GOOGLE_PLACES_API_KEY"
setup_secret "GOOGLE_PAGESPEED_API_KEY" "$GOOGLE_PAGESPEED_API_KEY"
setup_secret "SERP_API_KEY" "$SERP_API_KEY"
setup_secret "API_KEY" "$API_KEY"

# 4. IAM Permissions
echo "Granting IAM permissions..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUD_BUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"
COMPUTE_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# Cloud Build needs to access secrets
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/secretmanager.secretAccessor"

# Cloud Build needs to deploy to Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/run.admin"

# Cloud Build Service Account needs to act as the Cloud Run runtime service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/iam.serviceAccountUser"

# Cloud Build needs to push to Artifact Registry
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/artifactregistry.admin"

echo "⏳ Waiting 30s for IAM permissions to propagate..."
sleep 30

# FIX: Compute SA needs Storage Access for Cloud Build staging bucket
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/storage.admin"

# FIX: Grant specific access to the repository to avoid inheritance issues
echo "Granting Artifact Registry Writer access to Cloud Build SA on the repository..."
gcloud artifacts repositories add-iam-policy-binding proposal-engine \
    --project=$PROJECT_ID \
    --location=$GCP_REGION \
    --member="serviceAccount:$CLOUD_BUILD_SA" \
    --role="roles/artifactregistry.writer"

# FIX: Grant Artifact Registry Writer to Compute SA as well (fallback)
echo "Granting Artifact Registry Writer access to Compute SA on the repository..."
gcloud artifacts repositories add-iam-policy-binding proposal-engine \
    --project=$PROJECT_ID \
    --location=$GCP_REGION \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/artifactregistry.writer"

# FIX: Compute SA needs Log writing
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/logging.logWriter"

# FIX: Compute SA needs Cloud Run Admin (Cloud Build runs deploy as Compute SA)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/run.admin"

# FIX: Compute SA needs to act as service accounts for Cloud Run
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/iam.serviceAccountUser"

# FIX: Compute SA needs Secret Manager access (used as runtime SA for Cloud Run)
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/secretmanager.secretAccessor"

# 5. Validate Secrets
echo "Verifying secrets..."
MISSING_SECRETS=0
for secret in DATABASE_URL GOOGLE_PLACES_API_KEY GOOGLE_PAGESPEED_API_KEY SERP_API_KEY API_KEY; do
    if ! gcloud secrets versions list $secret --project=$PROJECT_ID --limit=1 > /dev/null 2>&1; then
        echo "❌ Secret $secret is missing or empty!"
        MISSING_SECRETS=1
    fi
done

if [ $MISSING_SECRETS -eq 1 ]; then
    echo "⚠️  Some secrets are missing. Deployment might fail or app won't work."
    echo "    Please ensure your .env file is populated and run this script again."
    read -p "    Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 6. Trigger First Build
echo "Triggering initial deployment..."
# Get Commit SHA or use timestamp
if git rev-parse --short HEAD > /dev/null 2>&1; then
    COMMIT_SHA=$(git rev-parse --short HEAD)
else
    COMMIT_SHA=$(date +%s)
fi

echo "Using COMMIT_SHA: $COMMIT_SHA"

gcloud builds submit --config cloudbuild.yaml \
    --substitutions=_COMMIT_SHA=$COMMIT_SHA .

echo "🎉 Deployment initiated! Run 'gcloud builds list' to see progress."
