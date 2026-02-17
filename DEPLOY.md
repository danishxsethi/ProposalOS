# ProposalOS — GCP Cloud Run Deployment

## Quick Start

### 1. Prerequisites

- Docker installed and running
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- GCP project with billing enabled
- APIs enabled: Artifact Registry, Cloud Run

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable artifactregistry.googleapis.com run.googleapis.com
```

### 2. Create Artifact Registry repository

```bash
gcloud artifacts repositories create proposal-engine \
  --repository-format=docker \
  --location=us-central1 \
  --description="ProposalOS container images"
```

### 3. Sync secrets (first time, or when keys change)

```bash
# Pushes API keys from .env.local to GCP Secret Manager
./scripts/sync-secrets-to-gcp.sh
```

### 4. Deploy with deploy.sh

```bash
# Set your project and region
export PROJECT_ID=proposal-487522
export REGION=us-central1

# For Cloud SQL, set DATABASE_URL before deploy:
export DATABASE_URL="postgresql://postgres:PASSWORD@/proposal_engine?host=/cloudsql/proposal-487522:us-central1:proposal-db"

./deploy.sh
```

### 5. Or deploy with Cloud Build

```bash
# Edit cloudbuild.yaml: set _REGION in substitutions
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_COMMIT_SHA=$(git rev-parse --short HEAD)
```

---

## Environment Variables & Secrets

Before deploying, configure secrets and env vars. See `.env.production.example` for the full list.

### Required secrets (create in Secret Manager)

```bash
# Create secrets (paste value when prompted)
echo -n "postgresql://..." | gcloud secrets create DATABASE_URL --data-file=-
echo -n "your-api-key" | gcloud secrets create API_KEY --data-file=-
echo -n "your-key" | gcloud secrets create GOOGLE_PAGESPEED_API_KEY --data-file=-
echo -n "your-key" | gcloud secrets create GOOGLE_PLACES_API_KEY --data-file=-
echo -n "your-key" | gcloud secrets create SERP_API_KEY --data-file=-
echo -n "your-key" | gcloud secrets create GOOGLE_AI_API_KEY --data-file=-
```

### Add secrets to Cloud Run deploy

Append to the `gcloud run deploy` command in `deploy.sh` or run:

```bash
gcloud run deploy proposal-engine \
  --image ... \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,API_KEY=API_KEY:latest,GOOGLE_PAGESPEED_API_KEY=GOOGLE_PAGESPEED_API_KEY:latest,GOOGLE_PLACES_API_KEY=GOOGLE_PLACES_API_KEY:latest,SERP_API_KEY=SERP_API_KEY:latest,GOOGLE_AI_API_KEY=GOOGLE_AI_API_KEY:latest" \
  --set-env-vars="GCP_PROJECT_ID=your-project,GCP_REGION=us-central1,NEXT_PUBLIC_APP_URL=https://your-service.run.app,NEXTAUTH_URL=https://your-service.run.app,BASE_URL=https://your-service.run.app"
```

### Cloud SQL (production database)

A Cloud SQL instance `proposal-db` is created in `proposal-487522`. Setup:

1. **Create database**: `./scripts/setup-cloud-sql.sh`

2. **Store DATABASE_URL in Secret Manager** (script prints the exact command)

3. **Grant Cloud SQL Client** to the Cloud Run service account:
   ```bash
   gcloud projects add-iam-policy-binding proposal-487522 \
     --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/cloudsql.client"
   ```

4. **Run migrations**:
   ```bash
   ./scripts/migrate-cloud-sql.sh
   ```
   (Uses port 5434 by default; kills any existing proxy first. Set `MIGRATE_PORT=5433` if needed.)

5. **Deploy**: `export DATABASE_URL="postgresql://...@localhost/proposal_engine?host=/cloudsql/.../" && ./deploy.sh`

Connection string format for Prisma + Cloud SQL: `postgresql://user:pass@localhost/db?host=/cloudsql/PROJECT:REGION:INSTANCE/` (trailing slash required).

---

## Health Check

Cloud Run uses `/api/health` for liveness. The endpoint returns:

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-02-15T22:00:00.000Z",
  "version": "0.1.0"
}
```

Returns 503 if the database is unreachable.

---

## Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build, port 8080, standalone output |
| `.dockerignore` | Excludes node_modules, .next, .git, .env*, etc. |
| `cloudbuild.yaml` | Cloud Build: build, push, deploy |
| `deploy.sh` | Local deploy: docker build → push → gcloud deploy |
| `.env.production.example` | All env vars with Cloud Run setup notes |
| `next.config.mjs` | `output: 'standalone'` for Docker |
| `app/api/health/route.ts` | Health check for Cloud Run probes |
