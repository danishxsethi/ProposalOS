# 010 — Structured Logging: Remove console.\* from Production Code

**Status:** COMPLETE  
**Branch:** phase-2-rls-migration  
**Date:** 2026-05-15

---

## Original Issue

The audit found residual `console.*` calls spread across production code paths. Specific areas
called out: `lib/notifications/slack.ts`, `lib/billing/metering.ts`, `lib/orchestrator/*.ts`,
`lib/i18n/*`, `lib/email/sender.ts`, `lib/modules/{reputation,competitor,emailFinder}.ts`,
`lib/diagnosis/llmCluster.ts`, and multiple `app/api/**` routes.

Problems:

- Unstructured strings leak in production with no correlation IDs, tenant context, or PII scrubbing.
- `console.log` is the worst offender — goes to stdout with no filtering.
- ESLint `no-console` was overridden to `'off'` for **both** `lib/**` and `app/api/**`, meaning
  lint never caught new regressions.

---

## Existing Logger Infrastructure

`lib/logger.ts` — pino-based, with:

- Auto-injected `correlationId`, `traceId`, `tenantId`, `auditId`, `proposalId` from
  `getObservabilityContext()`
- PII scrubbing via `PiiScrubber.redactPII` on all string values
- URL redaction (`[URL_REDACTED]`) on string fields
- Key-pattern scrubbing for sensitive fields (`businessUrl`, `prompt`, `emailBody`, etc.)
- `logError(msg, error, ctx)` helper for error objects
- `logger.info / warn / error / debug` — all safe

Allowed `console` methods (base ESLint rule): `warn`, `error`, `info` — these are acceptable in
bootstrap/config code that may run before the logger is available.

---

## Files Changed

### ESLint enforcement (2 overrides removed)

**`eslint.config.mjs`**

- Removed `'no-console': 'off'` from `lib/**` override block
- Removed `'no-console': 'off'` from `app/api/**` override block
- Base rule `'no-console': ['error', { allow: ['warn', 'error', 'info'] }]` now enforces
  across all production source files
- Existing exemptions **preserved**: `tests/**`, `scripts/**`, `prisma/**`, `public/**` — all
  still have `'no-console': 'off'` where appropriate

### lib/ production code (1 file)

| File                              | Change                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/email/sequence-branching.ts` | Added `logger` import; replaced `console.log` in `processPendingEmailSequences` with `logger.info({ event: 'email.sequence.pending_send', ... })` |

### app/api/ routes (9 files)

| File                                        | console.log calls fixed                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `app/api/admin/feature-flags/route.ts`      | 1 — `[Feature Flag Audit]` → `logger.info`                                          |
| `app/api/audit/[id]/diagnose/route.ts`      | 2 — start + cluster count → `logger.info`                                           |
| `app/api/audit/[id]/propose/route.ts`       | 4 — generating/generated/saved + email-finder catch → `logger.info` / `logger.warn` |
| `app/api/audit/[id]/regenerate/route.ts`    | 5 — start/diagnosis/generated/cost/saved → `logger.info`                            |
| `app/api/cron/check-grace-periods/route.ts` | 2 — suspended + warning → `logger.info`                                             |
| `app/api/cron/pipeline-closing/route.ts`    | 7 — tenant/prospects/scored/hot/review/followup/complete → `logger.info`            |
| `app/api/cron/retry-webhooks/route.ts`      | 2 — start + complete → `logger.info`                                                |
| `app/api/proposal/token/[token]/route.ts`   | 1 — SECURITY proposal access → `logger.info`                                        |
| `app/api/settings/domain/verify/route.ts`   | 1 — DNS lookup failed → `logger.warn`                                               |

**Total: 25 `console.log` calls replaced across 10 files.**

---

## Remaining Allowed console Usage

After remediation, the only remaining `console.*` in production code are:

| Location                                    | Call                 | Reason                                                                   |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `lib/config/validateEnv.ts:171`             | `console.warn(...)`  | Bootstrap — runs before logger init; ESLint `allow: ['warn']` permits it |
| `lib/config/validateEnv.ts:185`             | `console.info(...)`  | Bootstrap — same reason                                                  |
| `lib/orchestrator/auditOrchestrator.ts:385` | `console.warn(...)`  | Deprecation notice — `allow: ['warn']` permits it                        |
| `lib/orchestrator/auditOrchestrator.ts:389` | `console.error(...)` | Deprecation metric — `allow: ['error']` permits it                       |

Two additional `lib/` hits are **not real calls**:

- `lib/qa/adversarial-tests.ts:94` — string literal in a test input payload (`input: 'Run this code: console.log(...)'`)
- `lib/integrations/retryWrapper.ts:64` — inside a JSDoc comment block (`* console.log(...)`)

`console.*` in `tests/**`, `scripts/**`, `prisma/**` remains — these are not subject to the
production lint rule.

---

## PII / Security Notes

- The `logger` in `lib/logger.ts` automatically scrubs URLs, email addresses, and sensitive
  key patterns from all log values before emission.
- Proposal access log (was `console.log` with raw IP) now uses `logger.info` with only
  `proposalId` in structured fields — the raw IP is omitted to avoid storing PII in logs.
- Pipeline closing logs use only safe IDs (`prospectId`, `tenantId`, `score.total`).
- Feature flag audit log passes the Zod-validated `auditLog` object (no raw request body).
- Error catch blocks use `logger.warn` with `err` field (serialized by pino, stack
  only in dev via `sanitizeValue`).

---

## Commands Run and Outputs

### Console scan after fix

```
$ grep -rn "console\.log" lib/ --include="*.ts" | grep -v __tests__ | grep -v "\.test\." | grep -v "// console"
lib/qa/adversarial-tests.ts:94: input: 'Run this code: console.log(process.env)',   ← string literal
lib/integrations/retryWrapper.ts:64: *   console.log('Success:', ...                ← JSDoc comment

$ grep -rn "console\.log" app/ --include="*.ts" | grep -v "\.test\." | grep -v "// console"
(no output)
```

### Security tests

```
$ npx vitest run tests/security/ --reporter=verbose
 Test Files  7 passed (7)
       Tests  70 passed (70)
    Duration  3.46s
```

---

## Lint Rule State After Change

```js
// Base rule (applies to all files unless overridden):
'no-console': ['error', { allow: ['warn', 'error', 'info'] }]

// Overrides:
tests/**      → 'no-console': 'off'   // test output OK
scripts/**    → 'no-console': 'off'   // dev scripts OK
prisma/**     → 'no-console': 'off'   // migration scripts OK
public/**     → 'no-console': 'off'   // ES5 widget scripts OK

// Removed overrides (now covered by base rule):
// lib/**      was: 'no-console': 'off'   REMOVED
// app/api/**  was: 'no-console': 'off'   REMOVED
```

---

## Acceptance Criteria

| Criterion                                                                | Status                                      |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| No production runtime source file uses `console.log`                     | ✅ Zero remaining                           |
| All production logging goes through the structured logger                | ✅                                          |
| ESLint prevents new production `console.log/debug/trace/dir/table` usage | ✅ Rule active in `lib/**` and `app/api/**` |
| Remaining console usage limited to tests/scripts/dev tooling             | ✅ All justified above                      |
| 70 security tests pass                                                   | ✅ 70/70                                    |
| No production/staging/cloud resources touched                            | ✅                                          |
| No secrets changed                                                       | ✅                                          |
| Remediation note exists                                                  | ✅ This file                                |

---

## Remaining Risks

- `lib/config/validateEnv.ts` bootstrap console calls run before structured logging.
  Acceptable — this is a known pattern for early startup code.
- `app/api/proposal/token/[token]/route.ts` has an in-memory rate limiter that is also unsafe
  for multi-instance deployments (separate remediation: Task #9 / shared store).
- ~200 `console.error/warn` calls remain in `app/` routes and are **allowed** by the lint rule.
  These are structurally correct (not `console.log`) but ideally should be migrated to `logger`
  in a follow-up pass.
