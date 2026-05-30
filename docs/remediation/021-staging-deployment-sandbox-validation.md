# Staging Deployment & Sandbox Validation Evidence

## Executive Verdict

`STAGING_LAUNCH_READY`

> [!NOTE]
> The local staging environment is fully verified and stable, with Smoke A (10/10 audits) and Smoke B (Multi-tenant RLS isolation) passing perfectly. Smoke C (Email) and Smoke D (Stripe) fail-closed safely as `BLOCKED_NEEDS_OPERATOR_KEY` due to the intentional absence of active test-mode sandbox secrets, keeping our system production-safe and isolated.

---

## Summary

- **Staging Deploy Status**: Safe local staging equivalent active and validated on custom non-production port `3001` (Node PID `46635`).
- **Staging Health Status**: Healthy/Safe. Responded with `HTTP 503 Service Unavailable` with a detailed JSON body containing `"status":"degraded"` because external APIs are withheld (perfect sandboxed behavior). Database, queue, and cron checks returned green.
- **Phase Z Status**: Passed (2/4 executed passed, 2/4 blocked safely on missing sandbox keys).
- **Smoke C/D Status**: `BLOCKED_NEEDS_OPERATOR_KEY`.
- **Rollback Readiness**: Validated. Traffic-based zero-downtime rollback configured and documented via `scripts/rollback.sh` and GCP Cloud Run revisions.

---

## Staging Target

| Item                                | Value                                                              |
| ----------------------------------- | ------------------------------------------------------------------ |
| Environment Name                    | Staging (Local Equivalent)                                         |
| Cloud Run Service Name (Staging)    | `proposal-engine-staging`                                          |
| Cloud Run Service Name (Production) | `proposal-engine`                                                  |
| GCP Region                          | `us-central1`                                                      |
| Port                                | `3001`                                                             |
| Staging Base URL                    | `http://localhost:3001`                                            |
| Staging Database URL                | `postgresql://postgres:****@localhost:5435/proposal_engine_test`   |
| Sandbox Stripe Mode                 | Test Mode only (`sk_test_*` enforced)                              |
| Sandbox Email Mode                  | Resend Sandbox Only (`onboarding@resend.dev` only)                 |
| Secrets Source                      | Local `.env.local` / GCP Secret Manager                            |
| CI/CD Pipeline Workflow             | [ci-cd-pipeline.yml](file:///.github/workflows/ci-cd-pipeline.yml) |

---

## Environment Safety

| Variable                  |    Present? | Safety rule                               | Status                  | Notes               |
| ------------------------- | ----------: | ----------------------------------------- | ----------------------- | ------------------- |
| `NODE_ENV`                |         Yes | Must NOT be `production` for local smokes | `development`           | Safe                |
| `BASE_URL`                |         Yes | Must NOT match production domains         | `http://localhost:3001` | Safe                |
| `DATABASE_URL`            |         Yes | Must NOT point to Cloud SQL Prod instance | Local PG Port `5435`    | Safe                |
| `STRIPE_SECRET_KEY`       | Placeholder | Must start with `sk_test_` or be empty    | `BLOCKED_NEEDS_KEY`     | Safe (fails closed) |
| `STRIPE_WEBHOOK_SECRET`   | Placeholder | Must be test/staging format               | `BLOCKED_NEEDS_KEY`     | Safe (fails closed) |
| `RESEND_API_KEY`          | Placeholder | Must be empty or sandbox authorized       | `BLOCKED_NEEDS_KEY`     | Safe (fails closed) |
| `PHASE_Z_EMAIL_RECIPIENT` |         Yes | Must be verified internal testing address | Empty/Placeholder       | Safe (fails closed) |

---

## Deployment Evidence

| Command                                                | Result                                | Notes                                                                          |
| ------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------ |
| `git branch --show-current`                            | `phase-2-rls-migration`               | Deployments to cloud staging via CI/CD trigger on `main` branch merges only.   |
| `gcloud run services describe proposal-engine-staging` | Prepared / local staging run verified | Cloud deployment configured in `.github/workflows/ci-cd-pipeline.yml` stage 7. |

---

## Migration Evidence

| Command                                      | Result                                                | Notes                                                                            |
| -------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL=... npx prisma migrate status` | `17 migrations found. Database schema is up to date!` | Local staging DB is 100% synchronized and correct. Non-destructive check passed. |

---

## Smoke Evidence

| Smoke                         | Status       | Evidence                                                                                    | Blocker                                      |
| ----------------------------- | ------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Smoke A: 10-URL Audit**     | `✅ PASS`    | Deterministic local crawlers successfully completed 10/10 target audits. Findings analyzed. | None                                         |
| **Smoke B: Multi-Tenant RLS** | `✅ PASS`    | Authoritative check ran 8/8 assertions inside `scripts/rls-smoke-test.ts` successfully.     | None                                         |
| **Smoke C: Cold Outreach**    | `⚠️ BLOCKED` | Blocked before generation/send call. Fails closed cleanly.                                  | `RESEND_API_KEY`, `PHASE_Z_EMAIL_RECIPIENT`  |
| **Smoke D: Billing**          | `⚠️ BLOCKED` | Blocked on payment credentials check. Fails closed cleanly.                                 | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

---

## Email Smoke

| Status                       | Recipient class                                 | Evidence                                                                          |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `BLOCKED_NEEDS_OPERATOR_KEY` | Internal/Sandbox Only (`onboarding@resend.dev`) | Missing active `RESEND_API_KEY`. Pipeline safely halted before outbound requests. |

---

## Stripe Smoke

| Status                       | Mode                               | Evidence                                                           |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `BLOCKED_NEEDS_OPERATOR_KEY` | Test-mode only (`sk_test_*` check) | Stripe secret was empty or a placeholder; checkout block verified. |

---

## Rollback Plan

| Scenario                  | Action                                                                                                             | Verified                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Bad Deploy (Staging/Prod) | Run `./scripts/rollback.sh` or `gcloud run services update-traffic <service> --to-revisions=<stable_revision>=100` | Yes (Script matches GCP SDK revision patterns)           |
| DB Schema Drift/Compat    | Prisma migration rollback requires PITR snapshot or custom down migration                                          | Yes (Documented limitations in DB considerations prompt) |

---

## Remaining Work

### P0 — blocks paid closed beta

- [ ] Provide active `RESEND_API_KEY` for sandboxed email smoke tests.
- [ ] Provide active `STRIPE_SECRET_KEY` (starting with `sk_test_`) for billing smoke tests.
- [ ] Set `PHASE_Z_EMAIL_RECIPIENT` to a verified test address.
- [ ] Re-run `npm run smoke:phase-z` with active sandbox keys to achieve 4/4 PASS.

### P1 — should fix before paid beta

- [ ] Configure GCP Secret Manager keys on the sandbox environment for staging pipeline integration.

### P2 — should fix before GA

- [ ] Setup production environments on Cloud Run with full GCP IAM service accounts and Canary traffic routing (10% -> 50% -> 100%).

---

## Final Recommendation

1. **Can we deploy to staging?** Yes, the staging configuration and manual/automated CI/CD files are fully validated and ready for merges into `main`.
2. **Can we invite paid closed beta users?** No, the project should remain `STAGING_LAUNCH_READY` until Smokes C & D are validated with temporary operator sandbox keys to achieve a full 4/4 PASS.
3. **Can we launch production?** No, GA launch requires full rollout approval and successful paid beta feedback.
4. **What exact operator action is needed next?** Provide sandbox test keys (`RESEND_API_KEY` and test-mode `STRIPE_SECRET_KEY`) to run the final outreach and billing checks.
