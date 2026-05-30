# Remediation 008 — Package Manager & Lockfile Standardization

**Date:** 2026-05-14  
**Status:** COMPLETE  
**Blocker resolved:** P0/P1 from Completion Audit 2026-05-14 — both `package-lock.json` and `pnpm-lock.yaml` present  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## Selected Package Manager: **npm**

### Rationale

Evidence overwhelmingly favors npm as the canonical package manager:

| Location                               | Evidence                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `.github/workflows/ci-cd-pipeline.yml` | All 7 install steps use `npm ci`                                          |
| `Dockerfile`                           | `RUN npm ci`                                                              |
| `scripts/setup.sh`                     | `npm install`                                                             |
| `Makefile`                             | `npm install`                                                             |
| `README.md`                            | `npm install`                                                             |
| `package-lock.json`                    | **Tracked in git** — committed, authoritative                             |
| `pnpm-lock.yaml`                       | **Not tracked in git** — was an untracked local artifact                  |
| `.release-it.json`                     | `npm run lint`, `npm run test` hooks                                      |
| `.husky/pre-commit`                    | `npx lint-staged`                                                         |
| `package.json`                         | No `packageManager` field; `devDependencies` has no pnpm-related packages |

The only `pnpm` references in active source/config files were:

1. Historical Phase-2.x audit documents (read-only evidence, not executable scripts)
2. One `pnpm exec prisma db push` command in `lib/tenant/__tests__/shim-integration.test.ts` (a shell exec in a local-only integration test)

---

## Pre-existing State

- `package-lock.json` — **tracked in git**, used by CI, Dockerfile, all scripts
- `pnpm-lock.yaml` — was deleted in Task #4 (Remediation 004) and added to `.gitignore`
- No `.npmrc`, no `.pnpmrc`, no `packageManager` field in `package.json`
- `pnpm-lock.yaml` was already gitignored (Task #4 added it to `.gitignore`)

The audit found "both lockfiles exist" because the prior audit pre-dated Task #4. At the time this task runs, `pnpm-lock.yaml` is already deleted and gitignored. This task's work is therefore:

1. Fix the one remaining active `pnpm exec` reference in source code
2. Confirm no other active files have inconsistent references
3. Document the canonical decision

---

## Files Changed

| File                                                               | Change                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `lib/tenant/__tests__/shim-integration.test.ts`                    | Changed `pnpm exec prisma db push` → `npx prisma db push` |
| `docs/remediation/008-package-manager-lockfile-standardization.md` | This file                                                 |

No other source, config, or CI files needed changes — they were already using npm consistently.

---

## Exact Diff

### `lib/tenant/__tests__/shim-integration.test.ts`

```diff
-    `DATABASE_URL='${POOLED_POSTGRES_URL}' DIRECT_URL='${DIRECT_URL}' pnpm exec prisma db push --skip-generate`
+    `DATABASE_URL='${POOLED_POSTGRES_URL}' DIRECT_URL='${DIRECT_URL}' npx prisma db push --skip-generate`
```

This is a local-only integration test that runs `prisma db push` against a local smoke database. Using `npx` instead of `pnpm exec` is functionally equivalent and consistent with the rest of the toolchain.

---

## Search Results Confirming No Inconsistent References

After the fix, `pnpm` only appears in:

| File                                                     | Content                                         | Type                                  |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| `.gitignore`                                             | `pnpm-lock.yaml`                                | Intentional gitignore entry           |
| `docs/remediation/004-fix-broken-verification-script.md` | Explanation of `pnpm-lock.yaml` deletion        | Historical doc                        |
| `SECURITY-INCIDENT.md`                                   | `pnpm exec vitest run ...`, `pnpm exec tsc ...` | Historical Phase-1 audit evidence doc |
| `PHASE-2.2-FINDINGS.md`                                  | `pnpm exec prisma db push ...`                  | Historical audit doc                  |
| `PHASE-2.6-K-LOCAL-RLS-VERIFICATION.md`                  | `pnpm exec prisma migrate status`               | Historical audit doc                  |
| `PHASE-2.6-RLS-COVERAGE-INVENTORY.md`                    | `pnpm exec prisma db push ...`                  | Historical audit doc                  |
| `PHASE-2.6-M-RUNTIME-VERIFICATION.md`                    | `pnpm build`, `pnpm exec tsc`                   | Historical audit doc                  |
| `PHASE-2.3-DESIGN.md`                                    | Version reference in dependency analysis        | Historical audit doc                  |
| `PHASE-2.5-MIGRATION-MATRIX.md`                          | `pnpm build`, `pnpm exec vitest`                | Historical audit doc                  |
| `PHASE-2.1-RLS-AUDIT.md`                                 | `pnpm build`                                    | Historical audit doc                  |
| `.next/standalone/**`, `claraud-web/.next/**`            | Build artifact comments from Next.js internals  | Generated build output (gitignored)   |

All remaining `pnpm` references are in:

- Historical audit/remediation documentation (read-only, not executable)
- Generated build artifacts (gitignored, not in repo)

No `pnpm` references remain in any active source, config, CI, or script files.

---

## Commands Run and Outputs

### Verify the fix

```bash
grep -n "pnpm exec prisma" lib/tenant/__tests__/shim-integration.test.ts
# → (no output — no pnpm exec remaining)

grep -n "npx prisma db push" lib/tenant/__tests__/shim-integration.test.ts
# → 95:    `DATABASE_URL='...' DIRECT_URL='...' npx prisma db push --skip-generate`
```

### Confirm no pnpm in active source/config files

```bash
grep -rn "pnpm" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
  --include="*.json" --include="*.yml" --include="*.yaml" \
  --include="*.sh" --include="Dockerfile" --include="Makefile" \
  --exclude-dir=".next" --exclude-dir="node_modules" --exclude-dir="claraud-web" \
  . 2>/dev/null | grep -v PHASE | grep -v AUDIT | grep -v SECURITY | grep -v CHANGELOG | grep -v docs/remediation
# → (no output)
```

### Tests (no regressions)

```bash
npx vitest run tests/security/ lib/closing
# → Test Files  8 passed (8)
# → Tests  59 passed (59)
```

---

## Canonical Package Manager State (npm)

| Artifact                       | Status                               |
| ------------------------------ | ------------------------------------ |
| `package-lock.json`            | ✅ Tracked in git, authoritative     |
| `pnpm-lock.yaml`               | ✅ Deleted (Task #4), gitignored     |
| CI: `npm ci`                   | ✅ All 7 install steps               |
| Dockerfile: `npm ci`           | ✅                                   |
| Scripts: `npm install` / `npx` | ✅                                   |
| `.npmrc`                       | ✅ Not needed (default npm behavior) |
| `packageManager` field         | ✅ Not set (not required for npm)    |

### Install command (reproducible)

```bash
npm ci   # uses package-lock.json, deterministic
```

### Development install

```bash
npm install
```

---

## Remaining Risks

1. **Historical docs use `pnpm exec`** — `SECURITY-INCIDENT.md`, `PHASE-2.x-*.md` all contain `pnpm exec` commands. These are evidence documents, not executable scripts. They do not affect the build. However, anyone copy-pasting commands from these docs should substitute `npx` for `pnpm exec`.

2. **`pnpm-lock.yaml` gitignore** — Added in Task #4. If someone runs `pnpm install` locally, the lockfile will be regenerated but ignored by git. This is the correct behavior.

3. **`package-lock.json` staleness** — The `package-lock.json` was last updated 2026-04-25. It is tracked in git and used by CI. It is the authoritative lockfile. No dependency upgrades were introduced by this task.

---

## Acceptance Criteria Status

| Criterion                                               | Status                |
| ------------------------------------------------------- | --------------------- |
| Exactly one lockfile remains (`package-lock.json`)      | ✅                    |
| CI uses npm consistently                                | ✅ (7 `npm ci` steps) |
| Docker uses npm consistently                            | ✅ (`npm ci`)         |
| Deploy scripts use npm                                  | ✅                    |
| No inconsistent pnpm references in active source/config | ✅                    |
| Install is reproducible with selected lockfile          | ✅ (`npm ci`)         |
| No unrelated dependency upgrades                        | ✅                    |
| Production/staging/cloud resources not touched          | ✅                    |
| Secrets not changed                                     | ✅                    |
