# ProposalOS RC execution report

**As of:** 2026-10-09<br>
**Repository:** `Danish-Sethi/ProposalOS` (public; repository ID `1158247398`)<br>
**Working branch:** `codex/final-ci-qualification`<br>
**Source commit:** `75f1c5dcf412b5b37339dd438fda9d5db809e7c3` (`security: close public Claraud surfaces and trust claims`)<br>
**Technical verdict:** `SOURCE_RC_BLOCKED`<br>
**Commercial verdict:** `DEMO_NOT_READY`

## Source identity and preservation

The source chain is `main c5afb72 → AWS base 820598c → PR #4 785425f → PR #5 347852d → local qualification commits f836134, 9738f49, 926b21e, c7b3df8, 617a126, 0d0bbaa → 75f1c5d`. The local branch descends from PR #5. At the source commit, it is 132 commits ahead of `main` and differs across 1,195 paths.

Exact protected identities: `main c5afb723638a90e88c93067f8c2893dc1666d879`; VM backup `4a77f4c5f4137e4598f2a9ee0621ae2e5188d72b`; AWS backup/base `820598c3e06d69c79a0724c6460a67b8d8ab704b`; PR #4 `785425ff07082b366e1c8ea17ac74c0119f66b9b`; PR #5 `347852d35473a0f60ce5521ff1d2d07295ddd5f7`. The six qualification ancestors are `f836134e3cb840dc01f2b529ec81428e54d3e888`, `9738f49f55cd998ca76bbd449ecb186c9ec67cc8`, `926b21e44121ba3e36cfb563441df0d4f57fa2a2`, `c7b3df802d6fc7536fc9b9d863276a2ebe5f325c`, `617a1260dcf20021b79a15c60cd639d4d5c780f3`, and `0d0bbaa2ef5fbbe2b8ea493c01f63aa622b80fb9`. The current source commit is `75f1c5dcf412b5b37339dd438fda9d5db809e7c3`.

The remote preservation refs were read again and still resolve to VM backup `4a77f4c`, AWS backup/base `820598c`, PR #4 `785425f`, PR #5 `347852d`, and `main c5afb72`. PR #4 and PR #5 remain open, draft, and unmerged. No protected ref, original checkout, production service, or history was changed. The source commit is local only; it was not pushed and no new PR was opened.

The encrypted local bundle `ProposalOS-qualification-0d0bbaa.bundle.enc` has ciphertext SHA-256 `0725F4860699D6C72B5DF39D01510F1DE5FE5F36EC4EAC69383C690FA7573F24`, matching its local recovery note. It predates source commit `75f1c5d`; its independent decryption was blocked by desktop policy, so recovery is not independently verified and it is not a portable off-device backup. Five older plaintext artifacts remain under `%TEMP%`: `ProposalOS-qualification-9738f49.bundle`, `ProposalOS-qualification-9738f49.pass`, `ProposalOS-qualification-9738f49.crypt.cjs`, `ProposalOS-qualification-9738f49.verify.bundle`, and `ProposalOS-qualification-9738f49.openssl.bundle`. They were not removed because the prerequisite recovery verification is unavailable. Do not treat the ciphertext hash as proof of decryptability.

The audit evidence files `docs/security/audit-evidence/npm-audit-full.json` and `npm-audit-production.json` were regenerated locally and intentionally excluded from the source commit.

## Work completed

- Redis cache clearing is limited to ProposalOS cache keys; the application no longer calls a database-wide Redis flush or exposes destructive shared-store clearing.
- Claraud public lead/email and scan intake now fails closed. The public scan form and test-email endpoint are disabled while browser egress and the real delivery path remain unqualified.
- Public marketing, pricing, industry, blog, sample-report, and report-viewer copy no longer presents unverified customers, metrics, competitor comparisons, ROI, pricing, or delivery claims as facts. The sample report is explicitly synthetic. Tokenized reports are noindex, avoid sending share tokens to analytics, and disclose preliminary status; unsupported PDF delivery is disabled.
- Added focused regression tests and corrected the canonical proposal-compiler path test for Windows separators.

## Local qualification evidence

| Check | Result |
|---|---|
| Root TypeScript (`npx tsc --noEmit`) | PASS |
| Root ESLint | PASS, 0 errors and 1,825 existing warnings |
| Claraud changed TS/TSX files ESLint | PASS |
| Claraud full-repository ESLint | BLOCKED: 102 errors and 53 warnings; modified TS/TSX paths pass targeted lint, but findings were not compared with the base. CI does not run this command |
| Focused security/regression set | PASS: 10 files, 47 tests, Node 24 |
| Root production build | PASS with fake build-only environment values and loopback port 1 database URL; no provider call or database connection |
| Claraud production build | PASS, 36 static pages generated |
| Prisma schema validation | PASS |
| Dependency policy | BLOCKED: production tree 0 critical/high/moderate/low; full tree 0 critical, 12 high, 2 moderate, 1 low |
| PostgreSQL migration replay, tenant/RLS integration | BLOCKED: no disposable PostgreSQL/PgBouncer runtime available; production/staging were not used |
| Browser/Chromium SSRF and production egress | NOT QUALIFIED |

The 12 high findings remain in two development-tool advisory clusters: `GHSA-vfj7-8cjw-p6xm` (`braces`, no fixed release in the audited tree) and `GHSA-c475-qrg2-pj4r` (`basic-ftp`, fixed 6.2.1 is outside the current `get-uri` 5.x range). No major upgrade or exception was applied. See the [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [basic-ftp advisory](https://github.com/advisories/GHSA-c475-qrg2-pj4r).

## Security and publication gate

The current staged source diff passed Gitleaks 8.30.0 with redaction: zero findings. A scan of unpublished history from PR #5 to the prior local tip found two `generic-api-key` findings in test files in commit `617a126`; those exact values do not appear in any of the 20 currently published GitHub branches. The later `0d0bbaa` commit changed the tests to generate values at runtime, but that does not remove the earlier literals from the commit graph. Their provenance is unverified, so pushing this ancestry would publish them for the first time. The branch is preserved locally and publication is blocked pending owner classification or an approved way to produce a clean review history.

Separately, three bearer-like proposal-share values in already-public Git history remain `UNKNOWN / OWNER_ACTION_REQUIRED`; no old URL was opened and no production record was inspected or changed. GitHub secret-scanning alert #11 (`google_api_key`) remains open. Its fixture provenance and provider validity are unknown; no rotation was performed.

The public `/api/lead`, `/api/scan`, and test-email surfaces are fail-closed in this source candidate, but AWS still serves the October 6 release. These source changes have not contained those surfaces in production.

## CI and final decision

No GitHub Actions run exists for source commit `75f1c5dcf412b5b37339dd438fda9d5db809e7c3` because it has not been published. The latest PR #5 checks remain failed: Test Suite and Claraud build in run `37811073144`, and Gitleaks runs `37811046946` and `37811073142`. PR #4/#5 remain unchanged. A local build or earlier historical acceptance does not satisfy CI for this SHA.

**Verdict:** `SOURCE_RC_BLOCKED` / `DEMO_NOT_READY`. The immediate owner action is to classify the two unpublished test literals as synthetic from independent provenance, or authorize a safe review-history strategy. Do not paste token values into chat. After that, rerun the full redacted scan and only then publish a draft PR against `codex/ssrf-collector-boundary`.
