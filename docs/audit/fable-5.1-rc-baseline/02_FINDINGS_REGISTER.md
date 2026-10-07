# 02 — Findings Register — Fable 5.1

Use csv `evidence/findings.csv` as machine source. IDs stable.

## P0 — none open on this HEAD

No cross-tenant read proven, no unauthorized money mutation proven. Existing RLS and idempotency tests pass except boundary tests noted as P1/P2.

## P1

| ID | Title | Status | Evidence |
|---|---|---|---|
| F51-P1-001 | Migration drift: schema.prisma businessLatitude/Longitude not in committed migrations; db push dropped locale_configs | BROKEN | `prisma/schema.prisma:20` vs `psql \d "Audit"` pre-push; `npx prisma db push` log |
| F51-P1-002 | 11 tests fail on dirty branch (5 suites) | BROKEN | `tests/architecture/auth-session-boundary.test.ts:183` etc., `npm test` 11 fail |
| F51-P1-003 | 12 import/order lint errors | BROKEN | `npm run lint` 12 errors |

## P2

| ID | Title | Status |
|---|---|---|
| F51-P2-001 | SSRF fetch boundary: lib/maps/googleMapsProvider unallowlisted raw fetch | PARTIAL |
| F51-P2-002 | Auth boundary flags outreach webhook despite Svix verify | PARTIAL |
| F51-P2-003 | npm moderate: uuid/protobufjs/@grpc/proto-loader | PARTIAL |
| F51-P2-004 | Dual pricing source-of-truth + metering thresholds 3 vs 10 vs catalog | PARTIAL |
| F51-P2-005 | Module provider matrix 3 assertions fail on dirty branch | PARTIAL |
| F51-P2-006 | 2 uncommitted migrations + rolled_back row still present | PARTIAL |
| F51-P2-007 | admin/model-metrics no auth guard | PARTIAL |
| F51-P2-008 | billing/webhook alias no sig-verify string | PARTIAL |

## P3 — warnings, coverage, noise — do not block RC but fix before GA.

