# ProposalOS clean release-candidate execution report

**Evidence snapshot:** 2026-10-10 00:25 UTC
**Repository:** Danish-Sethi/ProposalOS (public; repository ID 1158247398)
**Candidate:** branch codex/clean-release-candidate-20261009, draft PR #6 against codex/ssrf-collector-boundary
**Code/test head at snapshot:** 627fe1db61643cb86d8f8cc7c2db22164095c47e
**Latest completed CI head:** d9e9eed8abfce5b432657536aee5f30921ab64aa (report-only changes after the code/test head)
**Technical verdict:** CLEAN_SOURCE_RC_PUBLISHED; full dependency policy still blocks CI acceptance
**Product verdict:** CORE_JOURNEY_BLOCKED
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
