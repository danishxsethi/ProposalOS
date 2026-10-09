# Proposal OS qualification: owner decisions

Date: 2026-10-09
Candidate branch: `codex/final-ci-qualification`
Preservation baseline: `f836134e3cb840dc01f2b529ec81428e54d3e888`

This record contains locations and classifications only. It deliberately omits credential and bearer-token values.

## Seven scan findings

| # | Original location | Introduction | Classification and current disposition |
|---|---|---|---|
| 1 | `lib/modules/__tests__/createEvidence.test.ts:66` | `c9f87884ae6167c716e840ea89abcf314fe5dfcd` | Credential-shaped Google API key in a negative test. The test now constructs a synthetic key-shaped value at runtime. The original value remains in public Git history; owner must confirm it is inert or revoke it in Google Cloud. GHAS alert #11 remains open. |
| 2 | `lib/modules/__tests__/createEvidence.test.ts:117` | `c9f87884ae6167c716e840ea89abcf314fe5dfcd` | Second occurrence of the same test key as #1, not a second distinct key. Same remediation and owner action. |
| 3 | `scripts/migration/production-legacy-migrations.json:13` | Present in preserved migration history | SHA-256 integrity digest for a legacy migration entry. It is used by the production-export importer to verify migration contents, is not an authentication credential, and needs no revocation. Gitleaks flags its shape in a directory scan; the Git-history scan does not classify it as a secret. |
| 4 | `scripts/regenerate-proven-proposals.ts:11` | `c6a2ba0d6df4520d43ce27c8e17932c143f35ef5` | Proposal `webLinkToken`; owner says its status is unknown or it could be live. The maintained script now uses a clearly synthetic token and no longer logs tokens. The original value remains in public Git history. Owner must revoke or rotate the corresponding proposal share link. |
| 5 | `scripts/regenerate-proven-proposals.ts:87` | `c6a2ba0d6df4520d43ce27c8e17932c143f35ef5` | Distinct proposal `webLinkToken`, with the same unknown/live status and owner action as #4. |
| 6 | `scripts/regenerate-proven-proposals.ts:142` | `c6a2ba0d6df4520d43ce27c8e17932c143f35ef5` | Distinct proposal `webLinkToken`, with the same unknown/live status and owner action as #4. |
| 7 | `lib/qa/__tests__/conversionAssetsRubric.test.ts:9` | `c6a2ba0d6df4520d43ce27c8e17932c143f35ef5` | Duplicate occurrence of the token in #4. The current test uses a synthetic token. The original value remains in public Git history and is covered by the same revocation action as #4. |

None of these seven findings was introduced by `f836134e` or by this local remediation. Replacing values in current source does not erase history or revoke a bearer token.

## Exposure and publication status

- `resolvePublicProposalAccess()` resolves proposals by `webLinkToken` and returns customer-facing proposal data. The values therefore have bearer-link semantics; no request was made to any proposal endpoint.
- The regeneration script is not invoked by a package script or a GitHub workflow. Its previous version printed each token when run. Repository evidence cannot establish whether a developer ran it locally or retained that console output, so historical local logs cannot be ruled out. No CI artifact invocation was found.
- The prior test fixture did not print the key; its source and history were public. The current qualification commit adds no credential-shaped literal.
- The repository currently has 11 open GitHub secret-scanning alerts. Alert #11 matches finding #1/#2. Other open alerts remain unchanged and are not classified by this seven-finding review.
- The four token matches represent three distinct tokens. The test occurrence is a duplicate of the first script token.

## Owner actions before publication

1. Treat all three proposal links as exposed until checked through an authorized owner path. Do not test the old URLs. The candidate adds a source-only `super_admin` revocation endpoint at `POST /api/admin/proposal-share-revocations`; it is not published or deployed. After separate review/deployment approval and confirmation that request/DB telemetry does not capture values, use its dry-run snapshot, then obtain explicit production-change approval before revoking. Record completion without recording token values. If an active proposal must remain shareable, plan a separate rotation workflow and private delivery.
2. Confirm whether the Google-key-shaped historical fixture is a synthetic placeholder. If that cannot be established confidently, revoke/rotate the key in Google Cloud and review its restrictions and usage there. Do not validate it by making a provider request.
3. Do not close the corresponding GHAS alert as “revoked” or “false positive” until the owner action is complete and evidenced.
4. Keep this candidate unpublished while live-token status and the Google-key alert remain unresolved. Do not rewrite history in this task.

## Safe source changes in the candidate

- Replaced the three embedded proposal tokens with synthetic, non-bearer placeholders.
- Removed the regeneration script's token-bearing log message.
- Replaced the API-shaped fixture with a runtime-generated synthetic value while retaining the detector assertion.
- Replaced the token in the proposal conversion test with a synthetic fixture.
- Left the migration checksum intact because the importer depends on it for integrity verification.
- Added a `super_admin`-only, dry-run-first share-token revocation endpoint with a three-target limit, snapshot-bound transactional updates, private fingerprints, operator-attributed audit events, and deterministic local tests. No live token lookup or revocation was performed.
