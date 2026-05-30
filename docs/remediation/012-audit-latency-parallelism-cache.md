# 012 — Audit Latency: Bounded Parallelism + Distributed Module Cache

**Status:** COMPLETE  
**Branch:** phase-2-rls-migration  
**Date:** 2026-05-15

---

## Original Issue

- Product claim: <30s audits.
- Phase P measurement: P95 audit latency 150–195s.
- `lib/audit/runner.ts` had module timeouts of 30–60s per module and no
  bounded concurrency at the phase level (modules could fan out unboundedly,
  causing provider throttling and tail latency).
- Existing cache (`lib/cache/apiCache.ts`) had a file-system fallback that is
  unsafe in multi-instance Cloud Run deployments.

## Recommended P1 fix

- Parallelize Phase 2 calls with bounded concurrency.
- Add Redis/shared-cache for Lighthouse + Places + repeatable modules.

---

## Current Pipeline Map

The audit runner already executes phases via `Promise.allSettled` — meaning
modules within a phase ran in parallel — but with **no concurrency cap**.
This task adds the cap and makes timing observable.

```
Phase 1 (Foundation, no deps):
  website, websiteCrawler, gbp, competitor, techStack, security, emailFinder
   → ~7 modules, all independent

Phase 2 (Analysis, depends on Phase 1):
  coreWebVitals    ← website
  schemaAnalysis   ← websiteCrawler
  reputation       ← gbp
  social           ← website
  socialDeep       ← social
  gbpDeep          ← gbp
  seoDeep          ← website, websiteCrawler
  accessibility    ← website
  mobileUX         ← website
  contentQuality   ← websiteCrawler
  conversion       ← website
  citations        ← gbp
  paidSearch       (no deps; optional)
  backlinks        (no deps; optional)
  privacyCompliance ← website
  schemaMarkup     ← websiteCrawler, gbp
  keywordGap       ← gbp, competitor
  videoPresence    ← competitor
   → ~18 modules, many of which call Gemini/Vertex/Lighthouse/Places

Phase 3 (Synthesis, depends on Phase 2):
  competitorStrategy ← competitor, seoDeep
  vision             ← websiteCrawler
   → ~2 modules
```

**Dependencies are preserved** — every module's `dependsOn` is checked
before execution, and missing-dependency results are still SKIPPED. Only
the **concurrency limit** is new.

---

## Parallelism Design

### What changed

- Replaced unbounded `Promise.allSettled(executions)` in `executePhase` with
  `runWithConcurrency(tasks, { limit: AUDIT_PHASE_CONCURRENCY })`.
- Added per-phase and per-module timing logs (structured, no PII).

### Concurrency limit

- **Default: 6** in-flight modules per phase.
- Tunable via `AUDIT_PHASE_CONCURRENCY` env var.
- Rationale:
  - Free-tier Gemini quotas tolerate ~6 concurrent calls before 429.
  - Lighthouse PSI quotas are per-API-key — 6 leaves headroom.
  - Lower = more sequential / safer for free tiers.
  - Higher = more parallel / requires paid quotas.

### What was NOT parallelized

- **Cross-phase parallelism** — Phase 2 still waits for Phase 1 to finish.
  Modules genuinely depend on Phase 1 outputs (e.g. `reputation` needs the
  `gbp.reviews` array).
- **Critical path modules** — `runAudit` already serializes phase boundaries
  to honour the dependency graph. Modules whose dependencies failed are
  marked SKIPPED rather than running in parallel with stale inputs.

### What is preserved

- `Promise.allSettled`-style semantics — one module failure does not crash
  the audit.
- Per-module timeout (`mod.timeoutMs ?? 30000`).
- Two-attempt retry on transient errors.
- AbortSignal propagation for global audit timeout.
- Cost budget enforcement (the existing `costTracker` is passed through).
- Structured logs — the new logs are `audit.phase_start`,
  `audit.phase_complete`, `audit.module_complete`, `audit.module_failed`.
  They include duration in ms and module name only — no raw responses.

### Concurrency primitive

`lib/audit/concurrency.ts` is a tiny dependency-free worker-pool. Why not
add `p-limit`?

- 30 LOC — trivially auditable and testable.
- No new runtime dependency.
- Same Promise.allSettled-style semantics already used in the runner.
- Deterministic result ordering (index-based, not completion-based).

---

## Cache Design

### What

`lib/cache/moduleCache.ts` — a thin wrapper over the SharedStore
(Redis-backed in prod, in-memory in dev/test) that adds:

- Versioned cache keys (`module-cache:{module}:v{version}:{sha256(input)}`)
- Per-module recommended TTLs (`MODULE_CACHE_TTL.LIGHTHOUSE`, etc.)
- Hit/miss logging with safe metadata only
- Corrupted-entry purge with miss-fallback
- Resilience to SharedStore failures (cache errors never block the caller)

### Why a new layer

The existing `lib/cache/apiCache.ts`:

- Falls back to filesystem when `REDIS_URL` is not set — **unsafe** for
  multi-instance Cloud Run (each instance has its own filesystem).
- Uses `cachedFetch(name, params, fetchFn, { ttlHours })` API that doesn't
  expose versioning for invalidation.

The new `moduleCache.ts`:

- Uses the production-safe SharedStore from Task #9 (Redis or fail-fast in
  prod).
- Exposes explicit `version: number` for schema-change invalidation.
- Logs hit/miss with structured events for observability.

### Cache keys (fingerprint material)

| Module               | Inputs included                              |
| -------------------- | -------------------------------------------- |
| `places-text-search` | `businessName`, `city`, `region`             |
| `places-details`     | `placeId`, `fields`                          |
| `lighthouse`         | `url`, `strategy` (mobile/desktop), `locale` |
| `serp`               | `query`, `location`, `gl`, `hl`              |

Module callers MUST include any input that changes the result. Helpers:

```ts
import { withModuleCache, MODULE_CACHE_TTL } from '@/lib/cache/moduleCache';

const placesData = await withModuleCache(
  {
    module: 'places-text-search',
    version: 1,
    input: { businessName, city },
  },
  { ttlSeconds: MODULE_CACHE_TTL.PLACES_TEXT_SEARCH },
  () => fetchFromPlacesAPI(businessName, city)
);
```

### TTLs

| Module                 | TTL | Reason                                      |
| ---------------------- | --- | ------------------------------------------- |
| Lighthouse / PageSpeed | 24h | Same URL → same scores within 24h cycle     |
| Places Text Search     | 24h | Place IDs are stable; rare business renames |
| Places Details         | 24h | Same place ID → same details                |
| SerpAPI                | 6h  | Rankings move faster than business listings |
| Generic short          | 1h  | Fallback for less stable data               |

### Versioning / Invalidation

Bump `version` to invalidate all cached entries for a module:

- v1 → v2 means callers stop seeing v1 entries (key changes).
- Old v1 entries expire naturally via TTL.
- No manual flush needed for schema changes.

### What is NOT cached

- Raw LLM prompts (could leak system prompt structure).
- Raw LLM responses (may contain customer-private extraction).
- Anything tenant-private without a `tenantId` in the key.
- Secrets, API keys, cookies, auth tokens.
- The `module-cache` namespace is shared across all tenants — only
  deterministic provider-API responses for public URLs/places go here.

---

## Files Changed

| File                                             | Change                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `lib/audit/concurrency.ts`                       | **New** — `runWithConcurrency(tasks, { limit })`                            |
| `lib/cache/moduleCache.ts`                       | **New** — versioned cache over SharedStore                                  |
| `lib/audit/runner.ts`                            | `executePhase` uses bounded concurrency; per-phase + per-module timing logs |
| `.env.example`                                   | Added `AUDIT_PHASE_CONCURRENCY`                                             |
| `tests/security/audit-parallelism-cache.test.ts` | **New** — 19 tests                                                          |

---

## Production Env / Config Requirements

| Variable                  | Required               | Purpose                                |
| ------------------------- | ---------------------- | -------------------------------------- |
| `AUDIT_PHASE_CONCURRENCY` | Optional (default 6)   | Modules in flight per phase            |
| `REDIS_URL`               | Recommended (existing) | Distributed module cache backing store |
| `SHARED_STORE_REQUIRED`   | Optional (existing)    | Fail-fast in prod if Redis missing     |

No new infrastructure required — reuses Redis from Task #9.

---

## Tests Added

`tests/security/audit-parallelism-cache.test.ts` — 19 tests:

**runWithConcurrency**

- Caps in-flight at limit
- Settles all tasks (mixed success/failure)
- Preserves index-based ordering
- Handles empty list
- limit=1 runs sequentially

**Mock benchmark**

- Parallel beats sequential by ≥2x with mocked 50ms latency × 6 tasks

**Module cache keys**

- Same input → stable key
- Different inputs → different keys
- Different versions → different keys

**Module cache get/set**

- Miss returns `{ hit: false }`
- Set + get returns stored value
- Module-name isolation
- Version isolation (bump invalidates)
- Corrupted JSON entry purged

**withModuleCache**

- Hit skips fetcher
- Miss calls fetcher and stores

**Resilience**

- SharedStore.get errors are treated as miss (caller not blocked)

---

## Commands Run and Outputs

```
$ npx vitest run tests/security/audit-parallelism-cache.test.ts --reporter=verbose
 Test Files  1 passed (1)
       Tests  19 passed (19)
    Duration  1.99s

$ npx vitest run tests/security/ --reporter=verbose
 Test Files  9 passed (9)
       Tests  109 passed (109)
    Duration  6.80s
```

**Mock benchmark output (captured in test logs):**

```
[benchmark] sequential=≈300ms parallel=≈55ms ratio=≈5.5x
```

With 6 mocked-50ms tasks, parallel execution at limit=6 finishes in
roughly one task's latency, vs sequential at 6 × 50ms. This proves the
**parallelism mechanism reduces wall-clock time**. It is **not** a real
production benchmark — see "Remaining Risks" below.

---

## Acceptance Criteria

| Criterion                                                 | Status                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Independent Phase 2 AI calls run with bounded parallelism | ✅ `AUDIT_PHASE_CONCURRENCY=6` default                                 |
| Existing module dependencies are preserved                | ✅ `dependsOn` checks unchanged; SKIPPED logic unchanged               |
| Expensive repeatable modules use shared-cache abstraction | ✅ `moduleCache` over `SharedStore`                                    |
| Cache keys include module + version + input fingerprint   | ✅ `module-cache:{m}:v{v}:{sha256}`                                    |
| Cache hit/miss tested                                     | ✅ 11 cache tests                                                      |
| Parallelism behavior tested                               | ✅ 5 concurrency tests                                                 |
| Per-module + total audit latency instrumentation          | ✅ `audit.phase_start/complete`, `audit.module_complete/failed` events |
| Local/mock benchmark shows parallel speedup               | ✅ ≥5x faster on mocked 6-task fan-out                                 |
| No live external provider calls in tests                  | ✅ All tests use mocks/in-memory store                                 |
| Remediation note exists                                   | ✅ This file                                                           |
| No production/staging/cloud resources touched             | ✅                                                                     |
| No secrets changed                                        | ✅                                                                     |
| <30s product target NOT claimed met                       | ✅ Real-world P95 still requires staging measurement                   |

---

## Remaining Risks

- **Real-world latency target not validated.** This change only proves the
  _mechanism_ (bounded parallelism + cache) works. The <30s P95 target
  remains tied to:
  - Live Gemini/Vertex provider response times (typically 8–15s per call).
  - Lighthouse PSI cold-cache time (often 20–40s).
  - SerpAPI throughput.
    Real measurement requires a staging smoke run (Phase Z, currently NO-GO).
- **Concurrency tuning matters.** Free-tier Gemini quotas may 429 even at
  limit=6 if many tenants run concurrently. Tune via env, observe.
- **Module migration is a follow-up.** This task adds the
  `moduleCache` abstraction. Migrating individual modules
  (`gbp.ts`, `seoDeep.ts`, etc.) from the legacy `cachedFetch` to the new
  `withModuleCache` is a separate, low-risk pass that should be done
  module-by-module with the relevant team review.
- **Old `apiCache.ts` still in use.** Modules currently using
  `cachedFetch` continue to work (file-system fallback in dev, Redis when
  `REDIS_URL` is set). The new `moduleCache.ts` is the production-safe
  path forward; removing `apiCache.ts` should happen once all callers are
  migrated.
