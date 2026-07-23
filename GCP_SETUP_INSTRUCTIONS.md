# ⚠️ GCP Setup - Action Required

## Issue Found

The Cloud Run service isn't deployed yet or the API isn't enabled. Here's what you need to do:

## Step 1: Enable Required APIs

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com --project=proposal

# Enable Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com --project=proposal

# Enable Cloud Logging API
gcloud services enable logging.googleapis.com --project=proposal
```

## Step 2: Deploy to Cloud Run

Make sure your service is deployed:

```bash
# Check if service exists
gcloud run services list --project=proposal

# If not, deploy it
gcloud run deploy proposal-engine \
  --source . \
  --platform managed \
  --region us-central1 \
  --project proposal \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 5
```

## Step 3: Get Your Service URL

```bash
gcloud run services describe proposal-engine \
  --region=us-central1 \
  --project=proposal \
  --format='value(status.url)'
```

This will output something like: `https://proposal-engine-abc123.run.app`

## Step 4: Set Up Cron Jobs

Once you have the service URL, use one of these methods:

### Option A: Automated Script (Recommended)

```bash
./scripts/setup-cron-jobs.sh https://proposal-engine-abc123.run.app
```

### Option B: Manual Commands

See `GCP_CRON_MANUAL_SETUP.md` for individual commands.

---

## Current Status

✅ Database migrations: Complete  
✅ Environment variables: Complete  
⏳ Cloud Run deployment: Needs your action  
⏳ Cron jobs: Waiting for Cloud Run URL  

## What's Blocking

1. Cloud Run API not enabled (permission issue)
2. Service not deployed yet

## Next Actions

1. Run the API enablement commands above
2. Deploy to Cloud Run
3. Get the service URL
4. Run the cron setup script

---

**Once you complete these steps, the autonomous pipeline will be fully automated! 🚀**
