# Remediation 004 — Fix Broken Verification Script & Clean Working Tree

**Date:** 2026-05-14  
**Status:** COMPLETE  
**Blocker resolved:** GA Blocker from Completion Audit 2026-05-14 — `scripts/verify-2.6-m.ts` in typecheck path  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## What `scripts/verify-2.6-m.ts` Was

`scripts/verify-2.6-m.ts` was a local, ad-hoc RLS runtime verification script created during Phase 2.6-M work on the `phase-2-rls-migration` branch. It was intended to test PgBouncer-pooled `app_user` + RLS behavior against a local `proposal_rls_smoke` database.

The file was **untracked in git** (`git ls-files --error-unmatch scripts/verify-2.6-m.ts` returned an error). It was never committed to the repository.

The file content was **corrupted** — it contained multiple overlapping/concatenated copies of the same script body, with import statements embedded inside template literal strings and template literals spanning multiple lines. This was not a simple syntax error; the file content was garbled beyond repair. Running `npx tsc --noEmit` produced 45 syntax errors all in this one file.

**The script was superseded by `scripts/rls-smoke-test.ts`**, which is the properly-written, committed, tracked equivalent. `rls-smoke-test.ts` performs the same RLS isolation matrix verification against local Postgres/PgBouncer databases.

---

## Decision: Deleted

**Rationale:**

1. **Untracked** — never part of the committed codebase; no history risk.
2. **Corrupted** — content was garbled, not fixable; the script had zero operational value in its current state.
3. **Superseded** — `scripts/rls-smoke-test.ts` already exists and is tracked, committed, and properly written.
4. **No production concern** — the script only referenced local development databases (`localhost:5435`, `localhost:6432`).

Deletion is cleaner than keeping a corrupted file excluded from typecheck via `tsconfig.json`.

---

## Files Changed

| File                                                     | Change                                                                                                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-2.6-m.ts`                                | **Deleted** — corrupted, untracked, superseded local verification artifact                                     |
| `pnpm-lock.yaml`                                         | **Deleted** — accidental untracked artifact from local pnpm usage (see below)                                  |
| `tsconfig.json`                                          | Removed `"scripts/verify-2.6-m.ts"` from `exclude` array (entry is no longer needed now that the file is gone) |
| `docs/remediation/004-fix-broken-verification-script.md` | This file                                                                                                      |

---

## Dirty Migration and Lockfile Handling

### `prisma/migrations/20260321_add_check_constraints/migration.sql` — KEPT

This file appears as `M` (modified) in `git status`. It was **intentionally modified** by Task #3 (Remediation 003) to fix SQL syntax errors that were preventing empty-DB migration replay. The changes are documented in `docs/remediation/003-migration-replay-empty-db.md`. **Not reverted.**

### `pnpm-lock.yaml` — DELETED

This file appeared as `??` (untracked) in `git status`. It was generated locally during Phase 2.6 work when `pnpm` commands were run. The project uses `npm` as its package manager — `package-lock.json` is the tracked, authoritative lockfile (used by CI via `npm ci`). `pnpm-lock.yaml` conflicts with the npm lockfile and was never intentionally added. It was not gitignored (a separate issue to address), but had no committed state to protect. **Deleted as an accidental artifact.**

### Other `M` entries in `git status` — KEPT

All other modified files are intentional changes from Tasks #1, #2, and #3:

- `next.config.mjs` — Task #1: removed `ignoreBuildErrors`
- `tsconfig.json` — Task #1: removed `ignoreBuildErrors` bypass; this task: removed now-unnecessary exclude entry
- `.github/workflows/ci-cd-pipeline.yml`, `Dockerfile`, `cloudbuild.yaml` — Task #1: added clarifying comments
- `app/api/case-study/[auditId]/generate/route.ts`, `app/api/public/audit/[id]/route.ts`, `app/api/public/audit/route.ts`, `app/api/widget/quick-audit/route.ts` — Task #2: tenant context fixes
- `package.json` — Task #3: added `db:migrate:empty-check` script
- `prisma/migrations/*` — Task #3: migration chain repair

### `??` untracked entries — NOTED

Other untracked items remain and are intentional new artifacts from Tasks #2–#3:

- `docs/remediation/` — remediation reports from Tasks #1–#4
- `prisma/migrations/20260227000000_init/` — Task #3: new init migration for empty-DB replay
- `scripts/check-migration-replay.sh` — Task #3: CI guard script
- `tests/security/public-routes-tenant-context.test.ts` — Task #2: regression tests
- `baseline.prisma`, `fix_baseline.js`, `fix_baseline.sh`, `fix_init.js`, `fix_init2.js`, `temp_baseline.prisma`, `test_1298.prisma` — pre-existing local scratch files from Phase 2.6 work; separate cleanup ticket recommended
- `.kiro/settings/`, `.postman.json` — IDE/tool artifacts; gitignore candidates

---

## Commands Run and Outputs

### Before — `git status` showing the problem

```
?? scripts/verify-2.6-m.ts
?? pnpm-lock.yaml
```

### Confirmed untracked status

```bash
git ls-files --error-unmatch scripts/verify-2.6-m.ts
# → error: pathspec 'scripts/verify-2.6-m.ts' did not match any file(s) known to git
```

### Typecheck after deletion

```bash
npx tsc --noEmit
# Found 1160 errors in 254 files.
# TSC_EXIT=2
```

The 1,160 errors are identical to the set documented in Task #1 (`docs/remediation/001-build-typecheck-env-validation.md`). `scripts/verify-2.6-m.ts` does not appear in the error list. The file is fully gone from the typecheck path.

### `git status` after cleanup

```
?? .kiro/settings/
?? .postman.json
?? baseline.prisma
?? docs/remediation/
?? fix_baseline.js
?? fix_baseline.sh
?? fix_init.js
?? fix_init2.js
?? prisma/migrations/20260227000000_init/
?? scripts/check-migration-replay.sh
?? temp_baseline.prisma
?? test_1298.prisma
?? tests/security/public-routes-tenant-context.test.ts
```

`scripts/verify-2.6-m.ts` and `pnpm-lock.yaml` are no longer present.

---

## Why the tsconfig exclude entry was also removed

Task #1 had added `"scripts/verify-2.6-m.ts"` to the `exclude` array in `tsconfig.json` as a temporary workaround while the script existed. Now that the script is deleted, the entry is unnecessary and slightly misleading. Removing it keeps `tsconfig.json` clean — no file-specific exceptions that reference non-existent files.

This does **not** weaken any TypeScript gate. The `exclude` array only had one entry (`node_modules`) before Task #1, and is back to that minimal state.

---

## Remaining Risks

1. **`pnpm-lock.yaml` is not gitignored.** It can reappear if someone runs `pnpm` commands locally. Recommend adding `pnpm-lock.yaml` to `.gitignore`.

2. **Other local scratch files not cleaned up.** `baseline.prisma`, `fix_baseline.js`, `fix_baseline.sh`, `fix_init.js`, `fix_init2.js`, `temp_baseline.prisma`, `test_1298.prisma` are untracked Phase 2.6 scratch files. They don't pollute typecheck but should be cleaned up or gitignored.

3. **1,160 pre-existing TypeScript errors remain.** These are unchanged from Task #1's documented state. They are P0 items on the remaining work backlog.

---

## Acceptance Criteria Status

| Criterion                                                  | Status                                           |
| ---------------------------------------------------------- | ------------------------------------------------ |
| `scripts/verify-2.6-m.ts` no longer in repo/typecheck path | ✅ Deleted                                       |
| Typecheck no longer fails because of that script           | ✅ File absent from 254-file error list          |
| Dirty working-tree items explained or reverted             | ✅ Documented above                              |
| No broad TS/CI/build gate weakened                         | ✅ tsconfig exclude now cleaner (one less entry) |
| No production/staging/cloud resources touched              | ✅                                               |
| No secrets changed                                         | ✅                                               |
