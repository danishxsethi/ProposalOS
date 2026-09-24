# Test Architecture & Gap Matrix

## Baseline commands

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS, warnings |
| `npm run typecheck` | FAIL: missing script |
| `npm run lint` | FAIL: 179 errors, 1,674 warnings |
| `npx prisma validate` | PASS |
| `npx prisma format --check` | FAIL: unformatted |
| `npm test -- --reporter=dot` | FAIL: 39/244 files failed; 192 tests failed, 2,341 passed, 87 skipped; local Postgres unavailable for many |

## Coverage shape

The repository contains unit, property, architecture, security, integration, load, accessibility-related, graph, module, persistence, webhook, and tenant tests. Much of the critical integration coverage mocks Prisma/providers/dispatch. There is no observed real provider + real database + worker + proposal + artifact end-to-end run.

## Critical gaps

- cache hit must materialize target audit/findings/evidence;
- all 27 modules with real failure states and unknown-vs-negative semantics;
- runtime finding contract against live Prisma schema;
- snapshot/finding transaction and referential integrity;
- two-tenant IDOR/RLS route matrix;
- public token expiry/publication across every page/API/PDF/PPTX/action;
- payment duplicate/stale/forged webhook and fulfillment task creation;
- worker crash/reclaim/external effect idempotency;
- live PDF/web proposal and email sandbox delivery;
- backup restore, load, p95 cost/latency, and accessibility browser evidence.

Test green is not a GA conclusion; current suite is not green in this environment.
