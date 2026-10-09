# ProposalOS clean release-candidate execution report

**Evidence snapshot:** 2026-10-09 23:50 UTC
**Repository:** Danish-Sethi/ProposalOS (public; repository ID 1158247398)
**Candidate:** branch codex/clean-release-candidate-20261009, draft PR #6 against codex/ssrf-collector-boundary
**Code/test head at snapshot:** fd85f2793df8fa94af5251dab2febb034d2ad408
**Technical verdict:** CLEAN_SOURCE_RC_PUBLISHED; CI acceptance remains blocked
**Product verdict:** CORE_JOURNEY_BLOCKED
**Commercial verdict:** PILOT_NOT_READY

This report update is a documentation-only follow-up to the code/test head above. The exact final branch SHA is the head of PR #6 after this report commit.

## Candidate integrity and preservation

The candidate starts at published PR #5 head 347852d35473a0f60ce5521ff1d2d07295ddd5f7. Source snapshot 0e9e57f849521be399bfade6985de585cab50a3b has the exact Git tree of intended local source 75f1c5dcf412b5b37339dd438fda9d5db809e7c3 (tree 9294530c37cb34568f8e18c90eeeed24282f4fc1). Documentation snapshot ac7c2027818aa85255730fa40af9adb9b5c656b2 has the exact tree of intended local documentation state 312026a815786a0d3a5709cc724a376a19ec8868 (tree 1c119407b4921add66c880163f2e524c982dbbf2). Follow-up commits split independent CI jobs and align stale tests with current service contracts; they do not include either suspect local-only commit.

The candidate descends from PR #5. Commits 617a1260dcf20021b79a15c60cd639d4d5c780f3 and 0d0bbaa2ef5fbbe2b8ea493c01f63aa622b80fb9 are not ancestors. No force push, merge, deployment, protected-ref edit, or production mutation occurred. PR #4 and #5 remain open drafts.

Protected refs last verified: main c5afb723638a90e88c93067f8c2893dc1666d879; VM backup 4a77f4c5f4137e4598f2a9ee0621ae2e5188d72b; AWS base/backup 820598c3e06d69c79a0724c6460a67b8d8ab704b; PR #4 785425ff07082b366e1c8ea17ac74c0119f66b9b; PR #5 347852d35473a0f60ce5521ff1d2d07295ddd5f7.

The encrypted local bundle ProposalOS-qualification-0d0bbaa.bundle.enc has recorded ciphertext SHA-256 0725F4860699D6C72B5DF39D01510F1DE5FE5F36EC4EAC69383C690FA7573F24, matching its note, but decryption and recovery were not independently verified because desktop policy blocked that operation. It predates the final source and documentation. Five older plaintext artifacts remain under %TEMP% and were not removed because recovery was not verified: ProposalOS-qualification-9738f49.bundle, ProposalOS-qualification-9738f49.pass, ProposalOS-qualification-9738f49.crypt.cjs, ProposalOS-qualification-9738f49.verify.bundle, and ProposalOS-qualification-9738f49.openssl.bundle. Do not treat the public candidate as a substitute for a verified portable encrypted backup.

## Publication and secret scanning

Draft PR #6 is at https://github.com/Danish-Sethi/ProposalOS/pull/6, base codex/ssrf-collector-boundary. The clean candidate’s new ancestry excludes the two suspect commits. Gitleaks 8.30.0 scanned all four candidate commits after PR #5 with redaction and found zero findings; the PR and push Gitleaks workflows also passed on fd85f2793df8fa94af5251dab2febb034d2ad408. The staged/worktree diff scan was clean.

A full-directory scan still identifies one inherited generic-key-shaped value in scripts/migration/production-legacy-migrations.json. The blob is identical to PR #5; it was not newly introduced or changed here. Its provenance is unresolved and should be handled as a separate historical fixture/secret decision. Three already-public proposal-share tokens remain UNKNOWN / OWNER_ACTION_REQUIRED. GitHub secret-scanning alert #11 for a Google-key-shaped fixture remains unresolved; no token URL was opened, no production record inspected, and no credential or token was revoked.

## Qualification evidence

| Gate                                       | Evidence at snapshot                                                 | Result                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GitHub candidate CI                        | Run 38005912371, exact head fd85f2793df8fa94af5251dab2febb034d2ad408 | FAIL                                                                                                         |
| TypeScript                                 | Test job 114074546718                                                | PASS                                                                                                         |
| Root lint                                  | Test job 114074546718; zero-error gate                               | PASS                                                                                                         |
| Prisma schema                              | Test job 114074546718                                                | PASS                                                                                                         |
| Disposable PostgreSQL/PgBouncer startup    | Test job 114074546718                                                | PASS                                                                                                         |
| Empty-database migration replay/drift gate | Test job 114074546718                                                | PASS                                                                                                         |
| Deterministic tests and tenant/RLS         | Test job 114074546718                                                | FAIL: 10 failed, 2,824 passed, 13 skipped; three RLS suites could not connect to PgBouncer at localhost:6432 |
| Claraud build                              | Job 114074546618 in run 38005912371                                  | PASS                                                                                                         |
| Dependency advisory policy                 | Job 114074546727 in run 38005912371                                  | FAIL                                                                                                         |
| Gitleaks                                   | Push run 38005908798; PR run 38005912406                             | PASS                                                                                                         |

Production dependency audit reports zero findings. The full dependency tree reports 12 HIGH, 2 moderate, and 1 low findings. The HIGHs cluster into two development-tool advisories:

| Advisory                                                                 | Locked package path and reachability                                                                                                                                                                   | Fix status                                                                                                                                                                                                                               | Owner decision if no compatible fix is validated                                                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 through Tailwind 3.4.19 (chokidar/micromatch) and Next ESLint tooling (fast-glob/micromatch). Dev-only; affected operation is parsing deeply nested brace patterns in build/lint tooling. | GitHub advisory lists no patched braces release. No dependency-tree removal was validated.                                                                                                                                               | Approve only a temporary exception for this exact advisory and enumerated dev-only paths, expiring in 30 days, with a production-tree zero-HIGH gate and recheck after upstream updates. Not approved or implemented.                   |
| [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r) | basic-ftp 5.3.1 through release-it 19.2.4 → proxy-agent 6.5.0 → pac-proxy-agent 7.2.0 → get-uri 6.0.5. Dev-only; exploit requires the FTP client to parse an attacker-controlled directory listing.    | Advisory fix is basic-ftp 6.2.1; get-uri 6.0.5 requests ^5.0.2. The latest inspected get-uri 8.0.1 still requests ^5.3.1, so no semver-compatible parent update removes the finding. A cross-major basic-ftp override was not validated. | Prefer a separately tested compatible parent release/override. If none is available, request an exact, dev-only exception expiring in 30 days, preserving the production gate and requiring a fresh audit. Not approved or implemented. |

The paths and versions above came from npm explain on the candidate lockfile and the current package metadata. No threshold was lowered, no broad suppression added, and no exception or major upgrade applied. Both advisories remain release-blocking under the repository’s full-tree HIGH policy.

Prior local evidence remains: root TypeScript and lint passed; the root and Claraud builds passed; Prisma schema validation passed. Claraud full-repository lint previously reported 102 errors and 53 warnings; that baseline was not compared against PR #5 and is not a required CI job. It is not claimed as passing.

## Security and operations still open

AWS still serves the October 6 images without clean Git-SHA provenance. The source Terraform contains the transferred-owner OIDC subject, while the last live IAM readback still had old-owner subjects; no IAM update or deployment occurred. Three public share-token dispositions, GHAS alert #11, browser/Chromium egress qualification, production data parity, private S3 delivery, scheduler authority, rollback exercise, and GCP retirement remain open. Historical GCP billing was read as disabled and the Cloud Build trigger inventory as empty; neither was changed in this work.

The RLS test failure was a connection failure, not a reported cross-tenant data leak: the job could not reach localhost:6432, and the shim suite hid its underlying psql error behind a generic stack-readiness message. Clean-database migration replay passed against direct PostgreSQL. A follow-up change now targets PgBouncer at 127.0.0.1, adds an authenticated app_user SQL preflight, and makes connection diagnostics identify the failed endpoint without printing a connection string. That correction has not yet been pushed or run in CI.

**Decision at this snapshot:** the clean source candidate is published and reviewable, but it is not CI-accepted. The dependency policy and RLS integration checks failed. No merge, deploy, live audit, provider call, customer outreach, email, payment, AWS/GCP mutation, or production database operation occurred.
