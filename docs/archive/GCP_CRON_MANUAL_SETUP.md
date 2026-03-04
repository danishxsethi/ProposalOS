# Manual GCP Cloud Scheduler Setup

If the automated script fails, use these manual commands to set up cron jobs.

## Prerequisites

```bash
# 1. Authenticate with GCP
gcloud auth login

# 2. Set your project
gcloud config set project proposal

# 3. Get your Cloud Run service URL
gcloud run services describe proposal-engine --region=us-central1 --format='value(status.url)'
```

## Manual Setup Commands

Replace `YOUR_SERVICE_URL` with the URL from above (e.g., `https://proposal-engine-abc123.run.app`)

### 1. Discovery Job (Every 6 hours)

```bash
gcloud scheduler jobs create http pipeline-discovery \
  --location=us-central1 \
  --project=proposal \
  --schedule="0 */6 * * *" \
  --uri="YOUR_SERVICE_URL/api/cron/discovery" \
  --http-method=POST \
  --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333" \
  --time-zone="America/New_York" \
  --description="Discover new prospects from external sources"
```

### 2. Audit Job (Every 2 hours)

```bash
gcloud scheduler jobs create http pipeline-audit \
  --location=us-central1 \
  --project=proposal \
  --schedule="0 */2 * * *" \
  --uri="YOUR_SERVICE_URL/api/cron/pipeline-audit" \
  --http-method=POST \
  --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333" \
  --time-zone="America/New_York" \
  --description="Process discovered prospects through audit pipeline"
```

### 3. Outreach Job (Every hour)

```bash
gcloud scheduler jobs create http pipeline-outreach \
  --location=us-central1 \
  --project=proposal \
  --schedule="0 * * * *" \
  --uri="YOUR_SERVICE_URL/api/cron/pipeline-outreach" \
  --http-method=POST \
  --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333" \
  --time-zone="America/New_York" \
  --description="Send outreach emails to proposed prospects"
```

### 4. Signal Detection Job (Daily at 2 AM)

```bash
gcloud scheduler jobs create http pipeline-signal-detection \
  --location=us-central1 \
  --project=proposal \
  --schedule="0 2 * * *" \
  --uri="YOUR_SERVICE_URL/api/cron/signal-detection" \
  --http-method=POST \
  --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333" \
  --time-zone="America/New_York" \
  --description="Detect business signals for optimal outreach timing"
```

### 5. Closing Job (Every 4 hours)

```bash
gcloud scheduler jobs create http pipeline-closing \
  --location=us-central1 \
  --project=proposal \
  --schedule="0 */4 * * *" \
  --uri="YOUR_SERVICE_URL/api/cron/pipeline-closing" \
  --http-method=POST \
  --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333" \
  --time-zone="America/New_York" \
  --description="Process hot leads and manage checkout sessions"
```

### 6. Delivery Job (Daily at 8 AM)

```bash
gcloud scheduler jobs create http pipeline-delivery \
  --location=us-central1 \
  --project=proposal \
  --schedule="0 8 * * *" \
  --uri="YOUR_SERVICE_URL/api/cron/pipeline-delivery" \
  --http-method=POST \
  --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333" \
  --time-zone="America/New_York" \
  --description="Process delivery tasks and check for overdue items"
```

## Verify Setup

```bash
# List all jobs
gcloud scheduler jobs list --location=us-central1 --project=proposal

# Test a job
gcloud scheduler jobs run pipeline-discovery --location=us-central1 --project=proposal

# View logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50 --project=proposal
```

## Troubleshooting

### Error: "Service not found"
- Make sure your Cloud Run service is deployed
- Check the service name: `gcloud run services list --project=proposal`

### Error: "API not enabled"
- Enable Cloud Scheduler API:
  ```bash
  gcloud services enable cloudscheduler.googleapis.com --project=proposal
  ```

### Error: "Permission denied"
- Make sure you have the right IAM permissions
- You need: `roles/cloudscheduler.admin` and `roles/iam.serviceAccountUser`

### Job not executing
- Check if the service URL is correct
- Verify the CRON_SECRET matches in `.env.local`
- Check Cloud Run logs for errors

## Next Steps

Once jobs are created:
1. Monitor execution in Cloud Scheduler console
2. Check logs in Cloud Logging
3. Set up alerts for failures
4. Test with sample data
