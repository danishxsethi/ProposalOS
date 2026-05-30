# Remediation 001 — Build Typecheck & Env Validation Suppression

**Date:** 2026-05-14  
**Status:** COMPLETE (suppression removed; pre-existing TS errors now visible and captured)  
**Blocker resolved:** GA Blocker #1 from Completion Audit 2026-05-14  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## Problem

`next.config.mjs` contained two suppressions that silently hid failures in every build:

```js
// BEFORE (bad)
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,   // ← hid ALL TypeScript errors at build time
  },
  env: {
    SKIP_ENV_VALIDATION: 'true', // ← disabled env validation for ALL environments
  },
  ...
};
```

This meant:

- TypeScript errors in `app/`, `lib/`, `scripts/`, `tests/`, and `claraud-web/` were silently ignored during `next build`.
- `validateEnv()` in `instrumentation.ts` was bypassed for every build and any runtime that inherited the baked-in env var.
- The production-hardening spec task 9.2 ("Set ignoreBuildErrors to false") was marked complete but the code contradicted it.

---

## Files Changed

| File                                   | Change                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `next.config.mjs`                      | Removed `typescript.ignoreBuildErrors` block and `env.SKIP_ENV_VALIDATION` block                     |
| `tsconfig.json`                        | Added `scripts/verify-2.6-m.ts` to `exclude` (broken local verification artifact, untracked in git)  |
| `.github/workflows/ci-cd-pipeline.yml` | Added clarifying comments to the two intentional `SKIP_ENV_VALIDATION=true` usages (build-time only) |
| `Dockerfile`                           | Updated comment on `ENV SKIP_ENV_VALIDATION=true` to be explicit about build-time-only scope         |
| `cloudbuild.yaml`                      | Added clarifying comment to `--build-arg SKIP_ENV_VALIDATION=true`                                   |

---

## Exact Diffs

### `next.config.mjs`

```diff
-/** @type {import('next').NextConfig} */
-const nextConfig = {
-  output: 'standalone',
-  typescript: {
-    ignoreBuildErrors: true,
-  },
-  env: {
-    SKIP_ENV_VALIDATION: 'true',
-  },
-  // Headers for locale-aware responses without legacy App Router i18n config
-  async headers() {
+/** @type {import('next').NextConfig} */
+const nextConfig = {
+  output: 'standalone',
+  // Headers for locale-aware responses without legacy App Router i18n config
+  async headers() {
```

### `tsconfig.json`

```diff
-  "exclude": ["node_modules"]
+  "exclude": [
+    "node_modules",
+    "scripts/verify-2.6-m.ts"
+  ]
```

`scripts/verify-2.6-m.ts` is an untracked local verification artifact (visible in `git status` as `??`) with corrupted content (template literal spanning multiple lines). It is not part of the application and should not be compiled.

### `.github/workflows/ci-cd-pipeline.yml`

Added comments to both `SKIP_ENV_VALIDATION: true` usages explaining they are intentional and scoped to build-time only:

```diff
-      - name: Build Application
-        env:
-          SKIP_ENV_VALIDATION: true
-        run: npm run build
+      - name: Build Application
+        # SKIP_ENV_VALIDATION is intentionally set here for the `next build` step only.
+        # Real secrets are not available at CI build time — they are injected at Cloud Run
+        # startup via Secret Manager. The running server validates env via instrumentation.ts.
+        # This flag must NOT appear in next.config.mjs or any runtime config.
+        env:
+          SKIP_ENV_VALIDATION: true
+        run: npm run build
```

```diff
-      - name: Build Docker Image
-        run: |
-          docker build \
-            ...
-            --build-arg SKIP_ENV_VALIDATION=true \
+      - name: Build Docker Image
+        # --build-arg SKIP_ENV_VALIDATION=true is intentional: secrets are not available
+        # at Docker image build time. They are injected at Cloud Run startup via Secret Manager.
+        # The running container validates env via instrumentation.ts on first request.
+        run: |
+          docker build \
+            ...
+            --build-arg SKIP_ENV_VALIDATION=true \
```

### `Dockerfile`

```diff
-# Build Next.js (skip env validation — vars are provided at runtime on Cloud Run)
-ENV SKIP_ENV_VALIDATION=true
+# Build Next.js
+# SKIP_ENV_VALIDATION=true is intentional here: secrets are not available at Docker image
+# build time on Cloud Run. They are injected at runtime via Secret Manager. The running
+# server validates all required env vars via instrumentation.ts on startup.
+ENV SKIP_ENV_VALIDATION=true
```

---

## Why `SKIP_ENV_VALIDATION=true` in Dockerfile/CI is correct and intentional

`next build` runs at Docker image build time. At that point, secrets (DATABASE_URL, API keys, etc.) are not available — they are injected at Cloud Run startup via Secret Manager. If `validateEnv()` ran during `next build`, it would always fail in CI/Docker because the required vars are absent.

The correct flow is:

1. `next build` runs with `SKIP_ENV_VALIDATION=true` → image is built without secrets.
2. Cloud Run starts the container and injects secrets via Secret Manager.
3. `instrumentation.ts` runs `validateEnv()` on first server startup → fails fast if any required var is missing.
4. `app/layout.tsx` also calls `validateEnv()` as a belt-and-suspenders check.

This is the standard Cloud Run / Next.js pattern. The problem was only that `next.config.mjs` baked `SKIP_ENV_VALIDATION='true'` into the app config permanently, which meant it was also active at runtime.

---

## Commands Run and Outputs

### After change — `npx tsc --noEmit`

```
Found 1160 errors in 254 files.
TSC_EXIT_CODE=2
```

All errors are pre-existing. They were previously hidden by `ignoreBuildErrors: true`. Zero errors were introduced by this change.

### Error breakdown by location

| Location                               | Error count | Notes                                                          |
| -------------------------------------- | ----------- | -------------------------------------------------------------- |
| `lib/` (production code)               | ~747        | Pre-existing; hidden since `ignoreBuildErrors: true` was added |
| `claraud-web/` (marketing sub-app)     | ~292        | Pre-existing; separate Next.js app                             |
| `scripts/` (excluding verify-2.6-m.ts) | ~78         | Pre-existing; utility scripts                                  |
| `tests/load/`                          | ~29         | k6 load test files — k6 types not installed                    |
| `tests/red-team/`                      | ~5          | Pre-existing                                                   |
| `scripts/verify-2.6-m.ts`              | 0           | Excluded from tsconfig                                         |

### Error breakdown by TS error code

| Code    | Count | Meaning                               |
| ------- | ----- | ------------------------------------- |
| TS2307  | 240   | Cannot find module (k6, missing deps) |
| TS2532  | 203   | Object is possibly undefined          |
| TS18048 | 172   | Value is possibly undefined           |
| TS2304  | 147   | Cannot find name (CostTracker, etc.)  |
| TS2339  | 83    | Property does not exist on type       |
| TS2345  | 77    | Argument type mismatch                |
| TS7006  | 67    | Parameter implicitly has 'any' type   |
| TS2322  | 59    | Type not assignable                   |

### Notable pre-existing errors in production code

- `lib/audit/runner.ts` — 43 errors: `CostTracker` not found (import missing or type mismatch)
- `lib/stripe/pricingService.ts` — 15 errors: `CurrencyConfig | undefined` not assignable, Prisma JSON type mismatches
- `lib/pipeline/humanReview.ts` — 14 errors: pre-existing type issues
- `lib/proposal/roiCalculator.ts` — 21 errors
- `lib/proposal/llm-orchestrator.ts` — 15 errors
- `lib/modules/website.ts` — 16 errors
- `lib/modules/mobileUX.ts` — 18 errors

---

## Remaining Work

These pre-existing TypeScript errors are now visible and must be fixed before `next build` will pass without `ignoreBuildErrors`. They are tracked as a separate backlog item.

**Recommended approach:**

1. Fix `lib/audit/runner.ts` CostTracker import (likely a missing import statement).
2. Fix `lib/stripe/pricingService.ts` Prisma JSON type casts.
3. Fix `lib/pipeline/humanReview.ts` type issues.
4. Work through remaining `lib/` errors file by file.
5. Decide whether `claraud-web/` should be in the same tsconfig or have its own.
6. Add k6 type definitions (`@types/k6`) or exclude `tests/load/` from tsconfig.
7. Once `npx tsc --noEmit` exits 0, `next build` will also pass cleanly.

Until those fixes are complete, `next build` will fail. This is the **correct and honest behavior** — the errors existed before; they were just hidden.

---

## Acceptance Criteria Status

| Criterion                                                         | Status                                                                |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `next.config.mjs` no longer ignores TypeScript build errors       | ✅ PASS — `ignoreBuildErrors` block removed                           |
| `next.config.mjs` no longer forces `SKIP_ENV_VALIDATION='true'`   | ✅ PASS — `env.SKIP_ENV_VALIDATION` block removed                     |
| No production/CI build path globally suppresses env validation    | ✅ PASS — remaining usages are build-time-only with explicit comments |
| Typecheck/build either pass or fail honestly with captured errors | ✅ PASS — 1,160 pre-existing errors now visible and documented here   |
| No secrets changed                                                | ✅ PASS                                                               |
| No production/cloud resources touched                             | ✅ PASS                                                               |
| Changes are minimal and focused on this blocker only              | ✅ PASS — 5 files changed, all targeted                               |

---

## SKIP_ENV_VALIDATION usage inventory (post-fix)

| Location                                            | Value                                             | Scope                                   | Intentional?                                        |
| --------------------------------------------------- | ------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `Dockerfile` line 22                                | `ENV SKIP_ENV_VALIDATION=true`                    | Docker image build step only            | ✅ Yes — build-time, not runtime                    |
| `.github/workflows/ci-cd-pipeline.yml` Build step   | `SKIP_ENV_VALIDATION: true`                       | CI `npm run build` step only            | ✅ Yes — build-time, not runtime                    |
| `.github/workflows/ci-cd-pipeline.yml` Docker build | `--build-arg SKIP_ENV_VALIDATION=true`            | Docker image build step only            | ✅ Yes — build-time, not runtime                    |
| `cloudbuild.yaml`                                   | `--build-arg SKIP_ENV_VALIDATION=true`            | Docker image build step only            | ✅ Yes — build-time, not runtime                    |
| `instrumentation.ts`                                | `if (process.env.SKIP_ENV_VALIDATION === 'true')` | Runtime guard — skips validation if set | ✅ Yes — allows local dev override via `.env.local` |
| `app/layout.tsx`                                    | `process.env.SKIP_ENV_VALIDATION !== 'true'`      | Runtime guard                           | ✅ Yes — same                                       |
| `.env.example`                                      | `# SKIP_ENV_VALIDATION="true"` (commented out)    | Documentation only                      | ✅ Yes — dev convenience, commented                 |
| `lib/config/validateEnv.ts`                         | Listed in `OPTIONAL_ENV_VARS`                     | Validation inventory                    | ✅ Yes — documents the var                          |
| `next.config.mjs`                                   | **REMOVED**                                       | Was: all environments                   | ✅ Fixed                                            |
