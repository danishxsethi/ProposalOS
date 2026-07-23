# Model Rollback Procedure

This document outlines the standard operating procedure (SOP) for rolling back Gemini model deployments if an issue is detected in production.

## 1. Trigger Conditions
Initiate a rollback immediately if any of the following occur:
- Error rates for LLM calls spike above 5% within a 10-minute trailing window.
- AutoQA average score drops below the established baseline for the 3.1 Pro canary cohort.
- P99 latency for `thinkingDuration` or `totalDuration` consistently exceeds 45 seconds.
- An unexpected cost explosion is detected by CostTracker triggering the `CostLimitError`.

## 2. Step-by-Step Rollback Procedure (Target Time: < 2 Minutes)
Due to the centralized model config abstraction, a rollback **does not require code changes or a CI/CD redeployment**. 

1. **Log in to GCP Console**: Navigate to the [Google Cloud Run Dashboard](https://console.cloud.google.com/run).
2. **Select the Service**: Click on `proposal-engine`.
3. **Edit Revisions / Environment Variables**:
   - Locate `GEMINI_31_PRO_TRAFFIC_PCT` and set it to `0`.
   - Alternatively, toggle `GEMINI_31_PRO_ENABLED` to `false`.
4. **Deploy**: Click **Deploy**. Traffic transitions immediately to the new revision using the stable `gemini-1.5-pro` model.
5. **(Optional) Database Flag**: If DB routing overrides env vars, hit `POST /api/admin/feature-flags` with a payload setting `GEMINI_31_PRO_TRAFFIC_PCT` to `0` using the Admin API key.

## 3. Verification Post-Rollback
1. Execute 3 test audits using the admin portal.
2. Confirm the `model` parameter logged in LangSmith is showing the stable fallback (`gemini-1.5-pro` or `gemini-1.5-flash`).
3. Monitor error rates in Pino logs for 15 minutes.

## 4. Escalation Path
If the Cloud Run rollback fails to propagate or error rates persist:
- Pause the cron orchestration (`PipelineStage.DIAGNOSIS` pause function).
- Notify engineering on-call to investigate API Key rate limits.
