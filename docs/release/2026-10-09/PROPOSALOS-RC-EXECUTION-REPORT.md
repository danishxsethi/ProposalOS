# ProposalOS clean release-candidate execution report

**Evidence snapshot:** 2026-10-10 00:25 UTC (candidate qualification) — updated 2026-10-10 06:05 UTC (controlled joined journey; see the appended section)
**Repository:** Danish-Sethi/ProposalOS (public; repository ID 1158247398)
**Candidate:** branch codex/clean-release-candidate-20261009, draft PR #6 against codex/ssrf-collector-boundary
**Code/test head at snapshot:** 627fe1db61643cb86d8f8cc7c2db22164095c47e
**Latest completed CI head:** d9e9eed8abfce5b432657536aee5f30921ab64aa (report-only changes after the code/test head)
**Technical verdict:** CLEAN_SOURCE_RC_PUBLISHED; full dependency policy still blocks CI acceptance
**Product verdict:** CORE_JOURNEY_BLOCKED at 00:25 UTC → **CONTROLLED_JOINED_JOURNEY_VERIFIED** on the execution branch as of 06:05 UTC (fixture journey; see append)
**Commercial verdict:** PILOT_NOT_READY

The code/test evidence below is bound to 627fe1db61643cb86d8f8cc7c2db22164095c47e. Any later report-only commit does not change that tested source tree.

## Candidate integrity and preservation

The candidate starts at published PR #5 head 347852d35473a0f60ce5521ff1d2d07295ddd5f7. Source snapshot 0e9e57f849521be399bfade6985de585cab50a3b has the exact Git tree of intended local source 75f1c5dcf412b5b37339dd438fda9d5db809e7c3 (tree 9294530c37cb34568f8e18c90eeeed24282f4fc1). Documentation snapshot ac7c2027818aa85255730fa40af9adb9b5c656b2 has the exact tree of intended local documentation state 312026a815786a0d3a5709cc724a376a19ec8868 (tree 1c119407b4921add66c880163f2e524c982dbbf2). Follow-up commits split independent CI jobs and align stale tests with current service contracts; they do not include either suspect local-only commit.

The candidate descends from PR #5. Commits 617a1260dcf20021b79a15c60cd639d4d5c780f3 and 0d0bbaa2ef5fbbe2b8ea493c01f63aa622b80fb9 are not ancestors. No force push, merge, deployment, protected-ref edit, or production mutation occurred. PR #4 and #5 remain open drafts.

Protected refs last verified: main c5afb723638a90e88c93067f8c2893dc1666d879; VM backup 4a77f4c5f4137e4598f2a9ee0621ae2e5188d72b; AWS base/backup 820598c3e06d69c79a0724c6460a67b8d8ab704b; PR #4 785425ff07082b366e1c8ea17ac74c0119f66b9b; PR #5 347852d35473a0f60ce5521ff1d2d07295ddd5f7.

The encrypted local bundle ProposalOS-qualification-0d0bbaa.bundle.enc has recorded ciphertext SHA-256 0725F4860699D6C72B5DF39D01510F1DE5FE5F36EC4EAC69383C690FA7573F24, matching its note, but decryption and recovery were not independently verified because desktop policy blocked that operation. It predates the final source and documentation. Five older plaintext artifacts remain under %TEMP% and were not removed because recovery was not verified: ProposalOS-qualification-9738f49.bundle, ProposalOS-qualification-9738f49.pass, ProposalOS-qualification-9738f49.crypt.cjs, ProposalOS-qualification-9738f49.verify.bundle, and ProposalOS-qualification-9738f49.openssl.bundle. Do not treat the public candidate as a substitute for a verified portable encrypted backup.

## Publication and secret scanning

Draft PR #6 is at https://github.com/Danish-Sethi/ProposalOS/pull/6, base codex/ssrf-collector-boundary. The clean candidate’s new ancestry excludes the two suspect commits. Gitleaks 8.30.0 scanned the five candidate commits after PR #5 with redaction and found zero findings. Push run 38008265022 and PR run 38008270263 passed on report-only PR head d9e9eed; source/test changes are unchanged from 627fe1d.

A full-directory scan still identifies one inherited generic-key-shaped value in scripts/migration/production-legacy-migrations.json. The blob is identical to PR #5; it was not newly introduced or changed here. Its provenance is unresolved and should be handled as a separate historical fixture/secret decision. Three already-public proposal-share tokens remain UNKNOWN / OWNER_ACTION_REQUIRED. GitHub secret-scanning alert #11 for a Google-key-shaped fixture remains unresolved; no token URL was opened, no production record inspected, and no credential or token was revoked.

## Qualification evidence

| Gate                                       | Evidence on report-only PR head d9e9eed (source/test head 627fe1d) | Result                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| GitHub candidate CI                        | Test Suite run 38008270296                                         | FAIL overall, only because full dependency policy fails                             |
| TypeScript                                 | Test job 114082033379                                              | PASS                                                                                |
| Root lint                                  | Test job 114082033379; zero-error gate                             | PASS                                                                                |
| Prisma schema                              | Test job 114082033379                                              | PASS                                                                                |
| Disposable PostgreSQL/PgBouncer startup    | Test job 114082033379; authenticated app_user preflight            | PASS                                                                                |
| Empty-database migration replay/drift gate | Test job 114082033379                                              | PASS                                                                                |
| Deterministic tests and tenant/RLS         | Test job 114082033379; 278 files                                   | PASS: 2,847 tests passed, including disposable database RLS and queue qualification |
| Claraud build                              | Job 114082033466 in run 38008270296                                | PASS                                                                                |
| Dependency advisory policy                 | Job 114082033211 in run 38008270296                                | FAIL: production 0 HIGH/CRITICAL; full tree 12 HIGH, 2 moderate, 1 low              |
| Gitleaks                                   | Push run 38008265022; PR run 38008270263                           | PASS                                                                                |

Production dependency audit reports zero findings. The full dependency tree reports 12 HIGH, 2 moderate, and 1 low findings. The HIGHs cluster into two development-tool advisories:

| Advisory                                                                 | Locked package path and reachability                                                                                                                                                                   | Fix status                                                                                                                                                                                                                               | Owner decision if no compatible fix is validated                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 through Tailwind 3.4.19 (chokidar/micromatch) and Next ESLint tooling (fast-glob/micromatch). Dev-only; affected operation is parsing deeply nested brace patterns in build/lint tooling. | GitHub advisory lists no patched braces release. No dependency-tree removal was validated.                                                                                                                                               | Approve only a temporary exception for this exact advisory and enumerated dev-only paths, expiring in 30 days, with a production-tree zero-HIGH gate and recheck after upstream updates. Not approved or implemented.                   |
| [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r) | basic-ftp 5.3.1 through release-it 19.2.4 → proxy-agent 6.5.0 → pac-proxy-agent 7.2.0 → get-uri 6.0.5. Dev-only; exploit requires the FTP client to parse an attacker-controlled directory listing.    | Advisory fix is basic-ftp 6.2.1; get-uri 6.0.5 requests ^5.0.2. The latest inspected get-uri 8.0.1 still requests ^5.3.1, so no semver-compatible parent update removes the finding. A cross-major basic-ftp override was not validated. | Prefer a separately tested compatible parent release/override. If none is available, request an exact, dev-only exception expiring in 30 days, preserving the production gate and requiring a fresh audit. Not approved or implemented. |

The paths and versions above came from npm explain on the candidate lockfile and the current package metadata. No threshold was lowered, no broad suppression added, and no exception or major upgrade applied. Both advisories remain release-blocking under the repository’s full-tree HIGH policy.

Claraud full-repository lint was rerun with Node 24. On PR #5 head 347852d it reports 129 errors and 64 warnings; on this candidate it reports 102 errors and 53 warnings. Of the 27 Claraud files changed from PR #5, the candidate has zero remaining lint findings; matching by file, rule, and message found zero new and 38 removed findings. The full lint still exits nonzero because the remaining 102 errors and 53 warnings are in unchanged files. Root lint and the Claraud production build pass in CI.

## Security and operations still open

AWS still serves the October 6 images without clean Git-SHA provenance. The source Terraform contains the transferred-owner OIDC subject, while the last live IAM readback still had old-owner subjects; no IAM update or deployment occurred. Three public share-token dispositions, GHAS alert #11, browser/Chromium egress qualification, production data parity, private S3 delivery, scheduler authority, rollback exercise, and GCP retirement remain open. Historical GCP billing was read as disabled and the Cloud Build trigger inventory as empty; neither was changed in this work.

The three historical share tokens remain UNKNOWN / OWNER_ACTION_REQUIRED. The canonical owner path is an authenticated POST to /api/admin/proposal-share-revocations: first run with dryRun true, then review the returned fingerprints and proposal/tenant/audit identities in the private admin session. If every identity matches, submit the same tokens with the exact expectedTargets, dryRun false, and confirmation REVOKE_PUBLIC_PROPOSAL_LINKS. The server requires a super_admin session, revokes transactionally, and records an audit event. No request was made; never put raw tokens in chat, logs, or URLs. GHAS alert #11 also remains unresolved and needs the credential owner to determine whether the historical Google-key-shaped fixture was ever live.

The earlier RLS failures were connection failures, not reported cross-tenant data leaks. The CI-only correction now targets PgBouncer at 127.0.0.1, performs an authenticated app_user SQL preflight, and identifies failed endpoints without printing connection strings. On report-only PR head d9e9eed, the disposable database migration replay and full deterministic suite passed, including the RLS/queue tests. This qualifies the isolated CI database path; it does not establish production database parity or a joined product journey.

**Decision at this snapshot:** the clean candidate is published and reviewable. Test, migration, build, and secret-scan checks pass on report-only PR head d9e9eed; its source/test code is 627fe1d. The full dependency policy remains red, so overall CI acceptance is blocked. No merge, deploy, live audit, provider call, customer outreach, email, payment, AWS/GCP mutation, or production database operation occurred.

---

## Append — controlled joined journey qualification (2026-10-10, execution branch `execution/glm53-core-journey-20261009`)

Branch base: PR #6 head 4284e9ca94eb8fe524d80e15cebef25fc4902859. The joined-journey work on this branch does not change the candidate qualification facts above; it adds the first demonstrated product journey and eight real product-defect fixes the journey surfaced.

**Journey result:** `CONTROLLED_JOINED_JOURNEY_VERIFIED` — one coherent run from authenticated intake to an 8-page branded proposal PDF through the real Next.js server, real durable worker, real SSRF-validated collectors, real diagnosis/proposal graphs, and real proposal QA, against disposable local infrastructure. Model responses came from the committed deterministic fixture provider (explicitly labeled; no real inference occurred). Full details and the honesty ledger live in `PROPOSALOS-CORE-JOURNEY-PROOF.md`.

**Product defects found by the journey and fixed on this branch** (each with the failing symptom first observed live):

| #   | Defect                                                                                                                                                                                       | Fix                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pe_live_*` API-key auth fails with `MissingTenantError` under the RLS-enforced app role                                                                                                     | Auth-resolution reads/writes run under explicit `runWithTenantBypass` (`lib/auth/apiKeys.ts`); regression test `lib/auth/__tests__/apiKeyValidationTenantContext.test.ts`                         |
| 2   | Security module crashes on http-only business sites (`fetch failed`)                                                                                                                         | Best-effort HTTPS header fetch; honest "HTTPS not enabled" findings instead (`lib/modules/security.ts`)                                                                                           |
| 3   | Screenshot capture ignores `CHROME_EXECUTABLE_PATH` in dev — no screenshots on servers                                                                                                       | Respect the env var in the dev launch path (`lib/evidence/screenshotCapture.ts`)                                                                                                                  |
| 4   | Diagnosis degrade path writes nonexistent `Audit.error` column (PrismaClientValidationError masks the degrade)                                                                               | Record the reason in `modulesFailed` per schema convention (`lib/graph/diagnosis-graph.ts`)                                                                                                       |
| 5   | Public proposal delivery permanently impossible: fingerprint/binding verifier hashed all findings while the compiler intentionally hashes the evidence-backed subset; check could never pass | Shared `isEvidenceBackedFinding` helper used by both compiler and verifier; verifier now hashes the identical id-sorted eligible subset (`lib/proposal/{inputEnvelope,compiler,publicAccess}.ts`) |
| 6   | Loopback fixture evidence rejected by the anti-fabrication pointer guard (correct production behavior)                                                                                       | Strictly test-scoped, exact-host, non-production exemption aligned with the SSRF fixture allowlist (`lib/modules/types.ts`); regression tests cover production refusal                            |
| 7   | No deterministic model-fixture path existed for CI-runnable journeys                                                                                                                         | Committed fixture LLM provider (`lib/llm/providers/fixture.ts`, `lib/llm/mode.ts`, registry/provider wiring) — labeled, fail-closed, production-refused                                           |
| 8   | No controlled-fixture SSRF accommodation existed                                                                                                                                             | Test-scoped loopback allowlist in `lib/security/urlValidator.ts` (exact host, loopback-only, production-refused, redirect re-validation intact); 10 regression tests                              |

**Test status on this branch at this writing:** targeted suites pass (security 499+10, fixture provider 9, evidence contract 20, auth/api-key 12 incl. realDb, worker realDb, proposal/diagnosis/graph 50, API surface, kill-switch 9, i18n/closing/pipeline). The full 278-file deterministic suite was executed locally against the disposable stack as the final gate for this session's changes (results recorded in the session evidence; CI will re-run on the pushed branch).

**Unchanged:** the full-tree dependency advisory policy remains red (GHSA-vfj7-8cjw-p6xm, GHSA-c475-qrg2-pj4r) and still blocks release acceptance; no exception or threshold change was made.

## Append 2 — dependency advisory remediation progress (2026-10-10, execution branch)

Two of the previously blocking advisory families are now genuinely remediated on the execution branch (validated locally; CI will confirm on the pushed branch):

| Advisory                                                                                             | Status                                    | Remediation and validation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GHSA-c475-qrg2-pj4r (basic-ftp 5.3.1 via release-it → proxy-agent → pac-proxy-agent → get-uri 6.0.5) | **REMEDIATED**                            | `overrides: { basic-ftp: ^6.2.3 }` (dev-only chain). Validated: `npm ls basic-ftp` shows 6.2.3, advisory cleared, and `release-it --dry-run` behaves identically before/after — the only dry-run error ("whatBump is not a function", a release-it 19.2.4 ↔ @release-it/conventional-changelog 10 incompatibility) reproduces identically on the unmodified PR #6 base (verified via a clean worktree + `npm ci`). basic-ftp's vulnerable code (FTP directory-listing parser) is only reachable through an FTP proxy URL, which the documented release flow never uses. |
| GHSA-g7r4-m6w7-qqqr (esbuild 0.27.3 — NEW advisory published after the 00:25 UTC report)             | **REMEDIATED**                            | vite bumped 7.3.6 → 7.3.7 (semver-compatible; 7.3.7 declares `esbuild ^0.27.0 \|\| ^0.28.0`) plus `overrides: { esbuild: ^0.28.2 }`. Validated: vitest/vite toolchain passes targeted suites after the change.                                                                                                                                                                                                                                                                                                                                                          |
| GHSA-vfj7-8cjw-p6xm (braces — all published versions affected)                                       | **UNPATCHABLE — owner decision required** | No patched braces release exists (latest 3.0.3 is itself affected). Affected paths are dev-only: tailwindcss 3.4.19 (chokidar/micromatch build watching) and eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch (lint globs). The only version-level fix is a breaking Tailwind 4 + toolchain migration, explicitly out of scope. The remaining 7 HIGH findings are all this advisory.                                                                                                                                                              |
| GHSA-rj75-hqrm-r3gf (postcss-selector-parser — NEW moderate advisory)                                | Noted                                     | Moderate does not trip the HIGH gate; surfaced for the next maintenance pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**Policy gate after remediation:** production tree 0/0/0/0 (unchanged); full tree critical=0 **high=7** (all braces) moderate=2 low=0. `npm run security:audit:prod` still fails the full-tree HIGH gate — correctly, because the braces findings remain.

### Prepared decision (NOT applied): narrowly scoped braces exception

If the owner chooses an exception over the breaking migration, the prepared scope is:

- **Advisory:** GHSA-vfj7-8cjw-p6xm (braces stack-exhaustion via deeply nested brace patterns).
- **Affected versions:** braces 3.0.3 (latest; no patched release exists anywhere in the 3.x line).
- **Transitive paths (dev-only):** `tailwindcss@3.4.19 → chokidar/micromatch → braces` (build-time glob watching) and `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (lint-time globs). No production/runtime path contains braces.
- **Reachability:** the vulnerable operation is parsing attacker-controlled deeply nested brace patterns. In these two paths the inputs are the repository's own source filenames — not attacker-controlled in any deployed or CI context.
- **Compensating controls:** the gate script continues to fail on every other HIGH/CRITICAL advisory (production-tree zero-HIGH check unchanged, verified this session); the exception would be keyed to the exact advisory ID with expiry.
- **Proposed expiry/review:** 30 days from approval, re-checked against upstream for a patched braces release or the planned Tailwind 4 migration.
- **Not done:** no exception added, no threshold lowered, no suppression committed. The gate still fails today, correctly.

## Append 3 — Wave 2 (2026-10-10, commits d40634c..d1556bc)

### Terraform regression (URGENT) — fixed and regression-tested

The Wave-1 OIDC commit (d2a6299) was wrong twice; both defects are reverted by restoring `github-actions.tf` byte-identical to the reviewed PR #6 version and adding `tests/security/oidc-trust-policy.test.ts` (9 tests: exact immutable subject, audience, main restriction, deployment-policy presence, no-wildcard checks, SHA-256 content tripwire). `terraform fmt -check` and `terraform validate` pass. Details in the AWS ledger Append 2. **No apply; live IAM untouched.**

### Commercial truthfulness — financial-claim gate

The fixture proposal's "$13,586/mo" revenue-loss headline was traced to invented severity floors, review-count-derived visitor heuristics, and fabricated fallback findings. All removed; a customer-facing financial-claim gate now permits dollar claims only with observed traffic/conversion/revenue inputs (none collected today). The controlled journey re-verified: `CONTROLLED_JOINED_JOURNEY_VERIFIED`, zero unsupported monetary claims in the rendered page and PDF. 10 regression tests; conversion rubric corrected to enforce suppression. Modeled estimates remain for internal prioritization only; any future displayed estimate is labeled "modeled" with documented inputs/assumptions.

### Dependency policy — prepared exception mechanism (NOT auto-approved)

`basic-ftp` (6.2.3) and `esbuild` (0.28.2) remediations from Wave 1 hold. The remaining 7 full-tree HIGHs are all GHSA-vfj7-8cjw-p6xm (braces, dev-only chains; no patched release exists). New gate mechanism (`lib/security/dependencyExceptions.ts` + rewired `scripts/check-dependency-audits.ts`): the single prepared exception (expiry 2026-11-09) activates ONLY via `PROPOSALOS_DEPENDENCY_EXCEPTIONS_APPROVED=true` (owner, in CI), and even then honors it only while unexpired, dev-only (automatic failure if braces becomes production-reachable), with the production zero-HIGH gate unchanged, CRITICAL never excusable, and every other HIGH/CRITICAL still failing. 8 tests cover each rule. **The gate fails today, correctly, and prints the exact activation instruction. No threshold was reduced.**

### CI (Wave 2 additions)

- New job **"Controlled fixture journey (M1, no real inference)"** runs the full joined journey on the disposable stack with local fixtures and no credentials, uploading evidence artifacts.
- All Wave-2 commits secret-scan clean (PR run 38069405715).
- Test Suite runs on the Wave-2 head are recorded in the session evidence; the required gates remain: everything green except the dependency-policy job while the braces decision is pending.

### What remains blocked

- **M2 (real inference):** authorization — see the ledger Append 2 for the exact minimal grants and spend ceiling.
- **M3 (first real audit):** no owner-approved domain; boundary qualification is complete and reproducible.
- **Braces decision:** the prepared exception awaits explicit owner approval (or the Tailwind 4 migration).
- **Live IAM trust correction + clean-SHA deployment:** IAM reads denied; apply remains owner-gated.
- Historical share tokens and GHAS alert #11 remain OWNER_ACTION_REQUIRED, unchanged.
