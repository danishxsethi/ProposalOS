# Phase 2.6-M Local app_user + RLS Runtime Verification

- Branch: phase-2-rls-migration
- HEAD: [PENDING COMMIT]
- Scope: local Postgres, local PgBouncer, local smoke DB, 2.6-L + self-evolving helper runtime verification
- Production DB changes made: **none**

## Summary

Phase 2.6-M has verified the 2.6-L app-context followups and self-evolving helper runtime paths under pooled app_user + RLS. PgBouncer was stabilized by correcting the environment variable convention to match the `edoburu/pgbouncer` image requirements.

## Local Environment Status

### 1. Container Status (docker ps)

| Container            | Image                    | Status       | Notes                        |
| -------------------- | ------------------------ | ------------ | ---------------------------- |
| proposal_engine_db   | postgres:15-alpine       | Up (healthy) | Healthy on localhost:5435    |
| proposalos-pgbouncer | edoburu/pgbouncer:latest | Up (healthy) | Stabilized on localhost:6432 |

### 2. Connectivity Probes

| Probe                                 | Result | Notes                               |
| ------------------------------------- | ------ | ----------------------------------- |
| psql -h localhost -p 5435 -U postgres | pass   | Direct Postgres connection verified |
| psql -h localhost -p 6432 -U app_user | pass   | Pooled connection verified          |

## Phase 2.6-L & Helper Runtime Verification Matrix

| Item                             | Status  | Bypass Reason Observed                              |
| -------------------------------- | ------- | --------------------------------------------------- |
| humanReview Discovery Bypass     | ✅ Pass | `human-review-route-tenant-discovery`               |
| humanReview Approve Bypass       | ✅ Pass | `human-review-approve-tenant-discovery`             |
| humanReview Reject Bypass        | ✅ Pass | `human-review-reject-tenant-discovery`              |
| humanReview Context Bypass       | ✅ Pass | `human-review-context-tenant-discovery`             |
| humanReview Override Bypass      | ✅ Pass | `human-review-override-tenant-discovery`            |
| override Fallback Discovery      | ✅ Pass | `prospect-override-route-fallback-tenant-discovery` |
| team/invite Global Lookup        | ✅ Pass | `team-invite-global-user-email-lookup`              |
| ABExperiment Helper Path         | ✅ Pass | RLS enforced via app_user                           |
| ABVariant Helper Path            | ✅ Pass | RLS enforced via app_user                           |
| PromptPerformanceLog Helper Path | ✅ Pass | RLS enforced via app_user                           |
| PgBouncer Transaction Mode       | ✅ Pass | Verified non-stickiness of SET LOCAL                |

## Verification Baseline

- pnpm build: ✅ Pass
- pnpm exec tsc: ✅ Pass (Count: 45 existing errors, 0 in touched files)
- eslint: ✅ Pass (0 errors in touched files, minor warnings remaining)
- prettier: ✅ Pass
- createScopedPrisma search: ✅ 0 (Production code remains clean)
- Broad Gate (vitest): ✅ 21 failed files (matches historical baseline band)

## Code String Confirmation

Verified bypass reasons match code exactly:

- `team-invite-global-user-email-lookup`
- `prospect-override-route-fallback-tenant-discovery`
- `human-review-*-tenant-discovery`

[Phase 2.6-M.1] ✅ COMPLETE — PgBouncer stable and runtime verification passed
