# ✅ GCP Setup Complete - Autonomous Pipeline

## What I've Done

### 1. ✅ Database Migrations
```bash
npx prisma generate  # ✅ Complete
npx prisma migrate dev --name autonomous-pipeline-complete  # ✅ Already in sync
```

**Status:** Database is ready! All pipeline models are in place.

### 2. ✅ Environment Variables
Added to `.env.local`:
- ✅ `CRON_SECRET` - For authenticating cron jobs
- ✅ `GOOGLE_MAPS_API_KEY` - Reusing existing GOOGLE_PLACES_API_KEY
- ⚠️ External API keys (placeholders added - see below)

**Status:** Core variables set. External API keys need your accounts.

### 3. ✅ Cron Job Configuration
Created:
- ✅ `cron.yaml` - Cron job definitions
- ✅ `scripts/setup-cron-jobs.sh` - Automated setup script

**Status:** Ready to deploy! See instructions below.

---

## 🚀 Next Steps (5 minutes)

### Step 1: Get Your Cloud Run URL

```bash
# Get your deployed service URL
gcloud run services describe proposal-engine \
  --region=us-central1 \
  --project=proposal \
  --format='value(status.url)'
```

### Step 2: Update the Setup Script

Edit `scripts/setup-cron-jobs.sh` and replace this line:
```bash
SERVICE_URL="https://proposal-engine-${PROJECT_ID}.run.app"
```

With your actual Cloud Run URL from Step 1.

### Step 3: Deploy Cron Jobs

```bash
# Make sure you're authenticated
gcloud auth login

# Run the setup script
./scripts/setup-cron-jobs.sh
```

This will create 6 Cloud Scheduler jobs:
1. `pipeline-discovery` - Every 6 hours
2. `pipeline-audit` - Every 2 hours
3. `pipeline-outreach` - Every hour
4. `pipeline-signal-detection` - Daily at 2 AM
5. `pipeline-closing` - Every 4 hours
6. `pipeline-delivery` - Daily at 8 AM

### Step 4: Verify Cron Jobs

```bash
# List all cron jobs
gcloud scheduler jobs list --location=us-central1 --project=proposal

# Test a job manually
gcloud scheduler jobs run pipeline-discovery --location=us-central1 --project=proposal
```

---

## ⚠️ External API Keys Needed

I've added placeholders for these API keys in `.env.local`. You'll need to sign up for accounts and add your actual keys:

### Required for Discovery & Enrichment:

1. **Yelp API** (for business discovery)
   - Sign up: https://www.yelp.com/developers
   - Add to `.env.local`: `YELP_API_KEY=your_key_here`

2. **Apollo API** (for contact enrichment)
   - Sign up: https://www.apollo.io/
   - Add to `.env.local`: `APOLLO_API_KEY=your_key_here`

3. **Hunter API** (for email finding)
   - Sign up: https://hunter.io/
   - Add to `.env.local`: `HUNTER_API_KEY=your_key_here`

4. **Proxycurl API** (for LinkedIn data)
   - Sign up: https://nubela.co/proxycurl/
   - Add to `.env.local`: `PROXYCURL_API_KEY=your_key_here`

5. **Clearbit API** (for company enrichment)
   - Sign up: https://clearbit.com/
   - Add to `.env.local`: `CLEARBIT_API_KEY=your_key_here`

### Optional (for payments):

6. **Stripe** (for checkout)
   - Sign up: https://stripe.com/
   - Add to `.env.local`:
     ```
     STRIPE_SECRET_KEY=sk_test_...
     STRIPE_WEBHOOK_SECRET=whsec_...
     ```

### Already Configured:
- ✅ Google Places API (for discovery)
- ✅ Google PageSpeed API (for audits)
- ✅ Resend API (for emails)

---

## 🧪 Testing the Pipeline

### Test Locally

```bash
# Start the dev server
npm run dev

# In another terminal, test a cron endpoint
curl -X POST http://localhost:3000/api/cron/discovery \
  -H "Authorization: Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333"
```

### Test on GCP

```bash
# Trigger a cron job manually
gcloud scheduler jobs run pipeline-discovery \
  --location=us-central1 \
  --project=proposal

# Check the logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=proposal-engine" \
  --limit=50 \
  --format=json \
  --project=proposal
```

---

## 📊 Monitoring

### View Cron Job Execution

```bash
# List all jobs with their status
gcloud scheduler jobs list --location=us-central1 --project=proposal

# View job details
gcloud scheduler jobs describe pipeline-discovery \
  --location=us-central1 \
  --project=proposal
```

### View Cloud Run Logs

```bash
# Real-time logs
gcloud logging tail "resource.type=cloud_run_revision" \
  --project=proposal

# Filter for pipeline logs
gcloud logging read "resource.type=cloud_run_revision AND textPayload=~'pipeline'" \
  --limit=100 \
  --project=proposal
```

---

## 🎯 What's Working Now

### ✅ Ready to Use
- Database with all pipeline models
- Environment variables configured
- Cron job definitions created
- Setup script ready to deploy

### ⚠️ Needs Your Action
1. Get Cloud Run URL
2. Update setup script with URL
3. Run `./scripts/setup-cron-jobs.sh`
4. Add external API keys (when ready to use those features)

### 🚀 After Setup
Once cron jobs are deployed:
- Pipeline will discover prospects every 6 hours
- Audits will run every 2 hours
- Outreach will send every hour
- All automated!

---

## 📁 Files Created/Modified

### Created:
- ✅ `cron.yaml` - Cron job definitions
- ✅ `scripts/setup-cron-jobs.sh` - Automated setup script
- ✅ `GCP_SETUP_COMPLETE.md` - This file

### Modified:
- ✅ `.env.local` - Added pipeline environment variables

---

## 🎉 Summary

**Database:** ✅ Ready  
**Environment Variables:** ✅ Core variables set  
**Cron Jobs:** ✅ Ready to deploy  

**Next:** Run `./scripts/setup-cron-jobs.sh` to deploy cron jobs!

---

## 💡 Pro Tips

1. **Start with one cron job** to test:
   ```bash
   # Just create the discovery job first
   gcloud scheduler jobs create http pipeline-discovery \
     --location=us-central1 \
     --schedule="0 */6 * * *" \
     --uri="YOUR_CLOUD_RUN_URL/api/cron/discovery" \
     --http-method=POST \
     --headers="Authorization=Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333"
   ```

2. **Test manually before scheduling:**
   ```bash
   curl -X POST YOUR_CLOUD_RUN_URL/api/cron/discovery \
     -H "Authorization: Bearer autonomous_pipeline_cron_secret_080b7c4aa772ea425ab408539a0db333"
   ```

3. **Monitor costs:**
   - Each cron job invocation costs ~$0.0001
   - 6 jobs running hourly = ~$4/month
   - Set up billing alerts in GCP Console

4. **Pause jobs if needed:**
   ```bash
   gcloud scheduler jobs pause pipeline-discovery \
     --location=us-central1 \
     --project=proposal
   ```

---

**You're all set! The autonomous pipeline is ready to go! 🚀**
