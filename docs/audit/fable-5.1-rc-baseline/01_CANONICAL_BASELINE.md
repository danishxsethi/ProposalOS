# 01 — Canonical Baseline — Fable 5.1

**Commit:** 5f66e09347e4314b592f9d008128e3b241e3b84e
**Branch:** remediation/proposalos-e2e (DIRTY: 28 modified, 10 untracked)
**Date:** 2026-09-27T23:30Z
**Node:** v25.6.0 npm 11.8.0 tsc 5.9.3 Prisma 5.22.0

## Reproducibility

| Check | Command | Result | Evidence |
|---|---|---|---|
| typecheck | `npm run typecheck` | PASS 0 errors | evidence/commands/01_typecheck.txt |
| lint | `npm run lint` | FAIL 12 errors, 1881 warns | evidence/commands/02_lint.txt |
| build | `npm run build` | PASS standalone | evidence/commands/03_build.txt |
| unit | `npm test` | 2744 pass, 11 fail, 266 suites | evidence/commands/04_tests.txt |
| prisma | `npx prisma validate` | valid | evidence/commands/05_prisma.txt |
| migrate status | `prisma migrate status` | 26 migrations up to date (after rolled_back resolve + db push) | psql _prisma_migrations |
| vuln scan | `npm audit` | 7 vulns (1 low, 6 moderate) | evidence/commands/06_npm_audit.txt |
| secrets | not run | UNVERIFIED | — |
| license | not run | UNVERIFIED | — |
| a11y | not run | UNVERIFIED | — |

## Deployables

- **Single Next.js standalone** (`Dockerfile` node:20-alpine, chromium for axe/puppeteer/pdf, `next start` on 8080)
- **Migrate job** (`Dockerfile.migrate`)
- **No separate worker deployable**; durable `AuditJob` queue + `/api/worker/audit-job` + cron sweeper; `ioredis`/`@vercel/kv`/`@upstash/ratelimit`
- **CI:** `.github/workflows/test.yml` (npm ci → security:audit:prod → prisma generate → docker compose postgres+pgbouncer → bootstrap-test-databases.sh → npm test --reporter=dot)

## Migrations

26 files `20260227_init` through `20260926020000_maps_identity_compliance_outbound`. One prior failure `20260924000000_audit_trust_contract` (constraint already exists) required `migrate resolve --rolled-back` then `db push` which dropped `locale_configs` (7 rows). Fresh DB from migrations alone now diverges from `schema.prisma` without `db push`.

## Current RC scope (recommended)

Keep for RC: 27 audit modules, audit→proposal→public proposal + PDF, Stripe checkout-proposal + saas, RLS tenant isolation, durable AuditJob queue, outreach discovery/qualification/enrichment + sniper guarded sandbox.
Defer/flag-off: multi-currency PricingService catalog (keep PlanCatalogService as canon), experimental self-evolving prompts DB tables detached from schema, Claraud widget as separate deployable story.
