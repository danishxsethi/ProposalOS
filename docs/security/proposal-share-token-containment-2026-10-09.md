# Proposal share-token containment review

Date checked: 2026-10-09. No token value, fingerprint, customer identity, proposal ID, or tenant ID is recorded here.

## Lifecycle found in source

- `Proposal.webLinkToken` is a unique UUID column. Prisma declares a database UUID default; proposal compilation also assigns a newly generated UUID. The token is stored as the raw value, not a one-way hash.
- Public proposal routes resolve by `webLinkToken` as a bearer capability. The resolver uses the token to locate a proposal, then checks rejection, revocation, audit trust/provenance, and a code-level 90-day maximum age based on `Proposal.createdAt`.
- `publicAccessRevokedAt` is enforced by the resolver. This candidate now adds `POST /api/admin/proposal-share-revocations`, a `super_admin`-only operator path to dry-run or revoke up to three exact links. It defaults to dry-run, returns only SHA-256 token fingerprints and internal record identities, requires the same dry-run record snapshot plus an explicit confirmation for writes, and writes an operator-attributed audit event in the same transaction as the revocation.
- The route is source-only and has not been published or deployed. Its existence does not establish any live token's disposition or revoke a production record.
- A new proposal receives a new token; that does not revoke the prior proposal's token.

## Disposition

The three distinct historical proposal tokens are **UNKNOWN / OWNER_ACTION_REQUIRED**. The current workstation has no `DATABASE_URL`; the production PostgreSQL instance is private RDS, and no disposable or approved owner database session is available here. No production record lookup, URL replay, or mutation was attempted.

The historical Google-key-shaped negative-test fixture is **UNKNOWN / OWNER_ACTION_REQUIRED**. GitHub secret-scanning alert #11 is still open. The current test now constructs a synthetic shape at runtime, but that does not prove the old value was synthetic or revoke it.

## Owner-controlled containment procedure

1. Keep all three links `UNKNOWN / OWNER_ACTION_REQUIRED` until an authorized private process has checked current production state. Do not request or test the old public URLs.
2. Before the route is used in production, review and deploy this source through the normal release path. Confirm the production request logger, tracing/APM, WAF, and database telemetry do not record request bodies or bound token values. The application code does not log request bodies or return the bearer values, but infrastructure logging was not verified here.
3. In an approved private production maintenance session, load the historical token values from the preserved Git commit directly into the HTTPS `POST` body. Never put them in a URL, shell argument, ticket, comment, screenshot, repository file, or CI input. Do not display the body in browser developer tools or a terminal transcript.
4. First send `{ "tokens": [...], "dryRun": true }`. The endpoint defaults to dry-run when `dryRun` is omitted. Review each stored-state disposition (`NOT_FOUND`, `ALREADY_REVOKED`, or `NOT_REVOKED`), proposal ID, tenant ID, audit ID, status, creation time, existing revocation time, and 64-character SHA-256 fingerprint. Require exactly three distinct expected records and no unmatched value. `NOT_REVOKED` only means the database revocation field is null; it does not claim the public resolver currently accepts the link. Do not copy bearer values from logs or output; they are never returned by the route.
5. Obtain explicit production-change approval separately. Then repeat the same token set with `dryRun: false`, the exact `expectedTargets` returned by the dry run, and `confirmation: "REVOKE_PUBLIC_PROPOSAL_LINKS"`. The route caps each request at three UUIDs, rechecks record and tenant identity transactionally, changes only `publicAccessRevokedAt`, and records the authenticated operator ID and timestamp. Audit-write failure aborts the transaction. A changed or missing target returns a conflict without revoking any target.
6. Verify the returned redacted disposition and internal revocation timestamps. If needed, call the resolver in process memory using a secure application-side operation, never by replaying an exposed URL. Record only `REVOKED`, `VERIFIED_INACTIVE`, `EXPIRED`, `NONEXISTENT`, or `UNKNOWN` with redacted evidence.
7. If a link must remain usable, plan a separately reviewed rotation flow; do not generate or deliver replacement links as part of this containment operation.
8. Have the GCP credential owner verify the historical API-key fixture provenance from their restricted key inventory. If validity cannot be ruled out, rotate/revoke the key and review its usage. Do not test it with a provider request, and do not resolve alert #11 until evidence supports the chosen resolution.

Publication remains blocked until all three links have a non-unknown disposition and the Google-key alert has an evidence-backed resolution. The source-only endpoint has not been deployed or used, so no token status changed during this qualification.
