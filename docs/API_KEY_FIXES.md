# API Key Issues Found

## ✅ Working
- Database connection
- SerpAPI

## ❌ Issues to Fix

### 1. PageSpeed API Key - INVALID
**Error:** "API key not valid. Please pass a valid API key."

**Fix:** Generate a new API key
1. Go to: https://console.cloud.google.com/apis/credentials?project=proposal-engine-mvp
2. Click "Create Credentials" > "API Key"
3. Restrict it to "PageSpeed Insights API"
4. Copy the key and update `.env.local`:
   ```
   GOOGLE_PAGESPEED_API_KEY=<your-new-key>
   ```

### 2. Places API (New) - NOT ENABLED
**Error:** "Places API (New) has not been used in project before"

**Fix:** Enable the API
- Visit: https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=652959865775
- Click "Enable"
- Wait 2-3 minutes for propagation

**Note:** Your Places API key is using project `652959865775` instead of `proposal-engine-mvp`. Either:
- Option A: Use the same API key for both projects
- Option B: Generate a new key in project `proposal-engine-mvp`

### 3. Vertex AI - AUTH MISSING
**Error:** "Unable to authenticate your request"

**Fix:** Authenticate with gcloud
```bash
gcloud auth application-default login
```

This will open a browser for you to authenticate. Once done, Vertex AI will work.

---

## Quick Fix Commands

```bash
# Fix Vertex AI auth (required for Gemini)
gcloud auth application-default login

# Check which project is active
gcloud config get-value project

# If needed, switch to the right project
gcloud config set project proposal-engine-mvp
```
