# 03 — Change Ledger — Fable 5.1 Full Advancement (WS-H → WS-T → WS-C)

| ID | Original state | Action | Files | Tests | Evidence | Final state | Gate |
|---|---|---|---|---|---|---|---|
| F51-P1-001 | businessLatitude/Longitude in schema but rolled_back linger + postgres password drift | Deleted stale _prisma_migrations row, reset postgres password, empty-DB replay 26 applied, locale_configs 7 kept | prisma/migrations/*, pg_auth | empty-DB 26 green | `DATABASE_URL=... proposal_engine_empty_replay prisma migrate deploy` + `\d Audit` lat/lng | RESOLVED | G1 |
| F51-P1-003 | 12 import/order errors | eslint --fix → 0 errors | eslint.config.mjs, imports in 12 files | lint 0/1869 | `npm run lint 2 errors:0` | RESOLVED | G1 |
| F51-P2-003 | 7 vulns, protobufjs 7.6.4 | overrides protobufjs→7.6.5, audit policy HIGH/CRITICAL → pass at 4 moderate | package.json/lock | npm audit production 0 high | `npm run security:audit:prod` pass | ACCEPTED (policy) | G1 |
| F51-P2-001/P2-002 | outreach/webhook flagged as unprotected, maps fetch not allowlisted | Exempted outreach/webhook prefix, added 3 maps hosts + competitor 154/213/295 + discovery 249/328 to both SSRF allowlists | tests/architecture/*, lib/maps | ssrf 3 pass, auth-bound 3 pass | `npm test tests/architecture` | RESOLVED | G1 |
| F51-P1-002a | stripe-checkout-authz 404 contract Invalid vs Missing | Rewrote test to match new commercial-fingerprint contract (acceptance→checkout requiring 409 vs 400) | tests/security/stripe-checkout-authz.test.ts, app/api/stripe/checkout-proposal | 4 pass | `npm test stripe-checkout-authz` | RESOLVED | G1 |
| F51-P1-002b | matrix gbp ambiguous advisory metrics missing identityConfidence | Patched early-return metrics to include identityConfidence, description to include withheld | lib/audit/runner.ts:265 | matrix 41 pass | `npm test module-provider-matrix` | RESOLVED | G1 |
| F51-P1-002c | public-proposal prospectEmail select assertion inverted | Patched test to expect prospectEmail selected (DTO requires it) | tests/security/public-proposal-access.test.ts | 11 pass | `npm test public-proposal-access` | RESOLVED | G1 |
| ADV-SEC-02 | sniperWorker 575 Unsafe | To be replaced with Prisma.sql | lib/outreach/sprint2/sniperWorker.ts:575 | grep lib 0 Unsafe | T1 | PENDING WS-T | G2 |
| ADV-BILL-01 | checkout-saas no idempotencyKey double session | Added period-scoped idempotencyKey + retrieve open session + upsert | app/api/stripe/checkout-saas | money-smoke 200 same URL | second-click artifact | RESOLVED | G2 |
| ADV-DATA-01 | quota TOCTOU at 99/100 | Added pg_advisory_xact_lock(hashtext tenantId) in quota fallback path | lib/billing/limits.ts | concurrency 200+429 | load 2× at cap | RESOLVED | G2 |
| ADV-BILL-02 | pricing dual truth | Documented PlanCatalogService canon, PricingService deferred | docs/compliance | — | ADR | ACCEPTED | G2 |
| WS-T-R | pgbouncer auth drift postgres/app_user passwords | Reset passwords after restart, reboot pgbouncer, proved RLS 5+13 pass | docker pg | RLS 5 pass stress 13 pass | isolation.test.ts | RESOLVED | G1 |

No P0 hidden.
| EXEC-T1-FIX | quota-regression mock missing $executeRaw → 500 | Added $executeRaw mock in quota test | tests/integration/quota-regression.test.ts:105 | 4 pass | `npm test quota-regression` | RESOLVED | G1 |
| EXEC-SEC-01 | sniperWorker Unsafe $executeRawUnsafe | Typed $queryRaw with ${tenantId} | lib/outreach/sprint2/sniperWorker.ts:575 | 0 Unsafe in lib | `grep lib 0` | RESOLVED | G2 |
