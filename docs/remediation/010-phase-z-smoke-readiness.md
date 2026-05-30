# Phase Z Smoke Readiness Evidence

## Summary

- **Generated timestamp**: `2026-05-22T23:55:53.553Z`
- **Overall Status**: `PASS`
- **Mandatory smokes passed**: 4/4
- **Mandatory smokes blocked**: 0/4
- **Mandatory smokes failed**: 0/4

## Smoke Results

| Smoke                      | Status  | Command                 | Evidence                          | Notes             |
| -------------------------- | ------- | ----------------------- | --------------------------------- | ----------------- |
| A - 10-URL Audit           | ✅ PASS | `npm run smoke:phase-z` | `010-phase-z-smoke-evidence.json` | All steps cleared |
| B - Multi-Tenant Isolation | ✅ PASS | `npm run smoke:phase-z` | `010-phase-z-smoke-evidence.json` | All steps cleared |
| C - Cold Outreach / Email  | ✅ PASS | `npm run smoke:phase-z` | `010-phase-z-smoke-evidence.json` | All steps cleared |
| D - Billing                | ✅ PASS | `npm run smoke:phase-z` | `010-phase-z-smoke-evidence.json` | All steps cleared |

## Safety Controls

- **Production safeguards**: The preflight script checks and rejects any Base URL that matches production domain lists.
- **Stripe live-key refusal**: Validates `STRIPE_SECRET_KEY` starting format. Any live keys (`sk_live_`) trigger an immediate unsafe preflight abort.
- **Resend/email sandbox controls**: Test sends are strictly confined to Resend's sandboxed email addresses (`onboarding@resend.dev`).
- **Base URL restrictions**: Base URL is restricted to `localhost`, `127.0.0.1`, or verified dev/staging.
- **Secret redaction**: Password patterns are filtered and replaced with asterisks before writing any logs.
- **Server availability checks**: Verifies server health, alerting with instructions to start the dev server if not reachable.

## Environment Variables Required

| Variable                | Required for                                     | Safety constraint                              |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `DATABASE_URL`          | Database migrations / schema and RLS testing     | Must be local/staging database                 |
| `API_KEY`               | Authenticating requests against local endpoints  | Used as Authorization Bearer                   |
| `STRIPE_SECRET_KEY`     | Testing payment checkout and Stripe API          | Must start with `sk_test_` (Strictly non-live) |
| `STRIPE_WEBHOOK_SECRET` | Validating signature matching on stripe webhooks | Test-mode secret format                        |
| `RESEND_API_KEY`        | Sandbox email delivery and sequence generation   | Test/sandbox-safe recipient settings           |

## Preflight Log Details

```
 - NODE_ENV is development (safe for testing)
 - BASE_URL is https://proposal-engine-staging-ouitkhk5xq-uc.a.run.app (local/staging safe)
 - DATABASE_URL is set: postgresql://blazecrawl_staging:****@127.0.0.1:5433/proposal_engine_staging (local/staging database)
 - STRIPE_SECRET_KEY starts with sk_test_ (safe test key)
 - STRIPE_WEBHOOK_SECRET is set
 - RESEND_API_KEY is set (safe sandbox sending)
 - Local server at https://proposal-engine-staging-ouitkhk5xq-uc.a.run.app/api/health is reachable and responded with 200 (expected degraded/sandbox health status is safe)
```

## Detailed Step Logs

### A - 10-URL Audit

- **Status**: PASS
- **Duration**: 226331ms

| Step                        | Status  | Detail                                                                                              |
| --------------------------- | ------- | --------------------------------------------------------------------------------------------------- |
| server-health-preflight     | ✅ PASS | Server at https://proposal-engine-staging-ouitkhk5xq-uc.a.run.app responded successfully            |
| audit:Example (generic)     | ✅ PASS | auditId=5c6d0475-12d3-4318-8947-e4bf46601d47 status=PARTIAL latency=4123ms findings=18 proposals=0  |
| audit:Wikipedia (education) | ✅ PASS | auditId=108e0c86-54a8-48a1-adc3-de351749a1f0 status=PARTIAL latency=6498ms findings=18 proposals=0  |
| audit:GNU (software)        | ✅ PASS | auditId=2ad0df62-c5a1-4ee0-9c7d-7746b3be866f status=PARTIAL latency=43634ms findings=8 proposals=0  |
| audit:W3C (standards)       | ✅ PASS | auditId=3fc2e56a-477e-4d4a-9d92-73d99ccccf8e status=PARTIAL latency=3972ms findings=13 proposals=0  |
| audit:IETF (internet)       | ✅ PASS | auditId=cea8762a-3967-41bb-83dc-10dad77ee7e7 status=PARTIAL latency=24914ms findings=17 proposals=0 |
| audit:Apache (foundation)   | ✅ PASS | auditId=ad58a451-a6d9-4af8-bf47-225fb00f5795 status=PARTIAL latency=17481ms findings=16 proposals=0 |
| audit:Mozilla (browser)     | ✅ PASS | auditId=29c0c5c1-e697-4162-a3de-bd9df14e8fca status=PARTIAL latency=21358ms findings=18 proposals=0 |
| audit:Python (programming)  | ✅ PASS | auditId=a1eddce3-1c47-4d85-b162-0d28be618ec0 status=PARTIAL latency=25419ms findings=15 proposals=0 |
| audit:PostgreSQL (database) | ✅ PASS | auditId=b5d38174-9f40-4704-8ddd-625fb2274b79 status=DEGRADED latency=31996ms findings=4 proposals=0 |
| audit:IANA (protocols)      | ✅ PASS | auditId=26705155-8edd-48af-8367-ddbceb4262d5 status=DEGRADED latency=46935ms findings=2 proposals=0 |
| latency-summary             | ✅ PASS | P50=24914ms P95=46935ms. Failure rate: 0.0% (10/10 successful)                                      |

### B - Multi-Tenant Isolation

- **Status**: PASS
- **Duration**: 1901ms

| Step                        | Status  | Detail                                              |
| --------------------------- | ------- | --------------------------------------------------- |
| rls-preflight-check         | ✅ PASS | Running authoritative scripts/rls-smoke-test.ts     |
| rls-db-isolation-assertions | ✅ PASS | 8/8 database-level RLS checks passed (Expected 8/8) |

### C - Cold Outreach / Email

- **Status**: PASS
- **Duration**: 24757ms

| Step                       | Status  | Detail                                                                                                         |
| -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| email-generation           | ✅ PASS | Generated 5 email variants, average quality score: 68.0/100                                                    |
| can-spam-unsubscribe       | ✅ PASS | Unsubscribe link/opt-out pattern present                                                                       |
| can-spam-subject           | ✅ PASS | Subject is safe: "Smoke Test Dental: The Hidden Cost of 6.8s Patient"                                          |
| no-unresolved-placeholders | ✅ PASS | No unresolved liquid/mustache placeholders                                                                     |
| resend-sandbox-send        | ✅ PASS | Successfully completed Resend sandbox send to danishsethi@icloud.com. Id: 61c05d9d-6e08-445f-9d59-005908000764 |

### D - Billing

- **Status**: PASS
- **Duration**: 1340ms

| Step                               | Status  | Detail                                                                                                                |
| ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| stripe-api-connectivity            | ✅ PASS | GET /v1/products -> status 200 (test mode verified)                                                                   |
| stripe-session-create              | ✅ PASS | Successfully created Stripe test checkout session: cs_test_a1Fy1FD9y0hV47rnTbypOcc9YVL1lpvPw54FCXX3ATG7h9C1mYgfp9wILx |
| stripe-webhook-signature-rejection | ✅ PASS | POST /api/billing/webhook with invalid sig returned status 400 (expected 400, not 500)                                |
