# Operator Checklist — Paid Closed Beta

This is a single-page operational checklist designed for the platform engineer or designated system operator to execute during the ProposalOS Paid Closed Beta. Keep this document printed or pinned for daily operations.

---

## 1. Before Inviting a Pilot Tenant

- [ ] **Check Database Isolation**: Verify PostgreSQL RLS rules are active and correct:
  ```bash
  npx ts-node scripts/rls-smoke-test.ts
  ```
- [ ] **Provision Tenant Model**: Run the tenant creator and assign a unique tenant ID.
- [ ] **Verify Magic Link Path**: Confirm that NextAuth links redirect only to staging `http://localhost:3001` or authenticated SSL domains.
- [ ] **Assign User Role**: Ensure the invited user is bound strictly to their tenant ID with the role `ADMIN` or `MEMBER`.
- [ ] **Configure Widget Origin**: Confirm the client's embed domain is mapped onto the origin allowlist.

---

## 2. Before Executing the First Audit

- [ ] **Validate API Credentials**: Verify that the Google, SerpAPI, and PageSpeed keys are set:
  ```bash
  npx ts-node scripts/validate-env.ts
  ```
- [ ] **Confirm Local Staging Port**: Check that the server is up on `http://localhost:3001`.
- [ ] **Verify Worker Pipeline**: Ensure the batch audit queue is listening and `healthy`:
  ```bash
  curl -fsS http://localhost:3001/api/health | jq .components.queue
  ```

---

## 3. Before Enabling Test Billing (Stripe)

- [ ] **Stripe Key Sanitization Check**: Ensure NO live keys exist in the environment:
  ```bash
  cat .env.local | grep STRIPE_SECRET_KEY
  # Output must start with sk_test_
  ```
- [ ] **Verify Webhook Endpoint**: Confirm Stripe CLI is forwarding to the correct endpoint:
  ```bash
  # In terminal session
  stripe listen --forward-to localhost:3001/api/billing/webhook
  ```
- [ ] **Test Subscriptions Mapping**: Run a test transaction using a Stripe mock card (`4242...`) and verify the subscription updates in the database.

---

## 4. Before Enabling Outreach (Resend)

- [ ] **Check Sandboxing Keys**: Confirm `RESEND_API_KEY` starts with `re_` and is in test mode.
- [ ] **Confirm Email Isolator**: Verify `PHASE_Z_EMAIL_RECIPIENT` is pointing ONLY to internal test targets:
  ```bash
  cat .env.local | grep PHASE_Z_EMAIL_RECIPIENT
  # Output must show danishsethi@icloud.com or onboarding@resend.dev
  ```

---

## 5. Daily Checks Checklist

- [ ] **API Health Status Check**: Run a synthetic check on `/api/health`.
- [ ] **Review Cost Tracker**: Confirm cumulative daily costs remain under **$50.00**.
- [ ] **Trace Stuck Audits**: Locate and clean any pipeline job hanging in `RUNNING` for &gt; 30 minutes.
- [ ] **Manual Proposal Quality Audit**: Review generated proposals using the score calculator:
  ```bash
  npx ts-node scripts/qa-review.ts --proposal-id=<id>
  ```

---

## 6. Emergency Stop Playbook (Trigger Immediately on P0/P1)

- [ ] **Step 1: Pause Asynchronous Workers**:
  ```bash
  gcloud run services update proposal-os-worker --min-instances=0 --max-instances=0 --region=us-central1
  ```
- [ ] **Step 2: Disable Checkout Path**: In `.env.local`, set `STRIPE_CHECKOUT_DISABLED=true` and restart the API service.
- [ ] **Step 3: Freeze Outreach Stage**:
  ```sql
  UPDATE "PipelineConfig" SET "pausedStages" = '["outreach"]';
  ```
- [ ] **Step 4: Execute gcloud Rollback**:
  ```bash
  ./scripts/rollback.sh --service proposal-engine --region us-central1
  ```
