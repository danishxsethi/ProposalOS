# Case-Study / PDF Token Authorization Remediation Evidence

## Summary

- **Previous Risk**: Public case-study route (`GET /api/case-study/[auditId]/generate`) and its raw viewer route were publicly reachable knowing or guessing only the `auditId`, leaking sensitive agency/client proposal details.
- **Current Status**: **PASS**
- **Route Protected**: Yes, both the generation API endpoint and the interactive printable page enforce production-grade double-gate authentication checks.
- **Token Model**: Securely reused and enhanced the existing `Proposal.webLinkToken` model (high-entropy, cryptographically secure 128-bit random UUIDs).

---

## Access-Control Matrix

| Flow                      | Route                                    | Auth Required  | Token Required  | Tenant Scoped | Audit/Proposal Scoped |  Status  |
| :------------------------ | :--------------------------------------- | :------------: | :-------------: | :-----------: | :-------------------: | :------: |
| Case-Study Generation     | `GET /api/case-study/[auditId]/generate` | Yes (or Token) | Yes (if public) |      Yes      |          Yes          | **PASS** |
| Case-Study Printable HTML | `GET /case-study/[auditId]/pdf`          | Yes (or Token) | Yes (if public) |      Yes      |          Yes          | **PASS** |
| Proposal Share Link       | `GET /public/proposal/[token]`           |       No       |  Yes (via URL)  |      Yes      |          Yes          | **PASS** |
| Tenant User Bypass        | `GET /api/case-study/[auditId]/generate` | Yes (Session)  |       No        |      Yes      |   Yes (owns audit)    | **PASS** |

---

## Token Design

- **Token Entropy**: Uses a cryptographically secure 128-bit random UUID v4 stored in the `webLinkToken` column of the `Proposal` table.
- **Token Comparison**: Checked using a customized constant-time string comparison (`timingSafeCompare`) to protect against timing-attack vectors attempting to guess a valid token.
- **Token Scope**:
  - Scoped to a specific `tenantId`.
  - Scoped to a specific `auditId` (by validating the proposal's relationship to the audit).
  - Explicitly prevents cross-tenant access.
- **Expiry / Lifespan**:
  - Automatically rejected if the linked proposal's status is `REJECTED`.
  - Rejected if the token age exceeds 90 days (`TOKEN_EXPIRY_DAYS = 90`).
- **Token Transport**:
  - Query parameter: `?token=<token>` (required for seamless, friction-free share links).
  - Authorization Header: `Authorization: Bearer <token>` (supported for programmatic or external api integrations).
- **Telemetry Safety**: Pure tokens are automatically redacted from error messages and debug outputs. Any URL logged during PDF generation is scrutinized to ensure query params are scrubbed or truncated.

---

## Route Behavior

Our protected routes enforce the following standard REST responses to keep information leaks to a minimum:

- **Missing Token / Unauthenticated**: Returns `401 Unauthorized` (or redirects to sign-in for interactive page sessions).
- **Invalid Token**: Returns `403 Forbidden` with a `INVALID_TOKEN` reason payload.
- **Expired Token**: Returns `403 Forbidden` with an `EXPIRED_TOKEN` reason payload.
- **Wrong Tenant User (Authenticated)**: Returns `403 Forbidden` with a `CROSS_TENANT_MISMATCH` reason payload, blocking rogue authenticated users from viewing audits belonging to other tenants.
- **Audit Not Found**: Returns `404 Not Found` with a safe, generic message (`Audit not found`) avoiding information disclosure to unauthorized external actors.
- **Valid Session / Token**: Returns `200 OK` and generates/downloads the PDF or displays the printable case-study HTML page.
- **Internal Generation Failure**: Returns `500 Internal Server Error` with a structured, generic error payload, avoiding raw stack-trace leaks to caller clients.

---

## Storage/PDF Safety Review

1. **Private by Default**: Generated case-study PDFs are not stored in public, globally-readable cloud buckets.
2. **On-the-fly Secure Generation**: Case studies are rendered on-the-fly inside our secure headless Puppeteer server context.
3. **Session Propagation**: When Puppeteer navigates to the printable page path, it safely propagates the validated token string (`?token=<token>`), maintaining the double-gate authorization architecture.
4. **No Cache Leaks**: Direct file storage lookups or download proxies mandate session validation or signed, temporary short-lived URLs.

---

## Files Changed

- **[lib/security/caseStudyAuth.ts](file:///Users/danishsethi/VSCODE/ProposalOS/lib/security/caseStudyAuth.ts)**:
  - Created the token and session validation helper function (`validateCaseStudyAccess`).
  - Added timing-safe comparison helper `timingSafeCompare`.
  - Enforced cross-tenant restrictions, status expiration, and age checks.
- **[app/api/case-study/[auditId]/generate/route.ts](file:///Users/danishsethi/VSCODE/ProposalOS/app/api/case-study/[auditId]/generate/route.ts)**:
  - Integrated `validateCaseStudyAccess` to secure the PDF download API.
  - Extracted tokens safely from both Bearer Authorization headers and search parameters (under strict TypeScript index-safety checks).
  - Propagated tokens to the generator process.
- **[app/case-study/[auditId]/pdf/page.tsx](file:///Users/danishsethi/VSCODE/ProposalOS/app/case-study/[auditId]/pdf/page.tsx)**:
  - Secured the interactive rendering page. Ensures anyone trying to scraper/fetch raw printable markup is fully authenticated or possesses a valid unexpired token.
- **[lib/pdf/generateCaseStudyPdf.ts](file:///Users/danishsethi/VSCODE/ProposalOS/lib/pdf/generateCaseStudyPdf.ts)**:
  - Appends the validated token to the headless chrome's navigation target URL.
- **[lib/pdf/generatePdf.ts](file:///Users/danishsethi/VSCODE/ProposalOS/lib/pdf/generatePdf.ts)**:
  - Redacted token logs during PDF generation runs to maintain telemetry hygiene.

---

## Tests Added / Updated

| Test File                                             | What it Proves                                                                                                                                               |       Result       |
| :---------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------: |
| `tests/security/case-study-token-authz.test.ts`       | Complete case study security suite: missing, invalid, expired, and wrong tenant tokens/sessions are rejected; valid tokens succeed; no token logging occurs. | **PASSED** (12/12) |
| `tests/security/public-routes-tenant-context.test.ts` | Verification that case-study API generation operates safely under tenant boundaries via runWithTenantAsync, avoiding MissingTenantErrors.                    | **PASSED** (19/19) |
| `tests/architecture/public-document-authz.test.ts`    | Architectural scanner validating that no generate/download API routes are publicly exposed without session or token-scoped authorization guards.             |  **PASSED** (1/1)  |

---

## Commands Run

| Command                                                              | Reason                                                      | Result                                | Exit Code |
| :------------------------------------------------------------------- | :---------------------------------------------------------- | :------------------------------------ | :-------: |
| `npx vitest run tests/security/case-study-token-authz.test.ts`       | Validate our core token authorization business rules.       | Passed 12 of 12 tests.                |    `0`    |
| `npx vitest run tests/security/public-routes-tenant-context.test.ts` | Validate tenant isolation and routing security context.     | Passed 19 of 19 tests.                |    `0`    |
| `npx vitest run tests/security/`                                     | Validate whole security test suite of 12 files.             | Passed 177 of 177 tests.              |    `0`    |
| `npx tsc --noEmit`                                                   | Validate type compilation checks under strict environments. | No compilation errors.                |    `0`    |
| `npm run lint`                                                       | Verify ESLint checks and format consistency.                | Standard code cleanliness, no errors. |    `0`    |

---

## Final Acceptance Proof

### TypeScript Verification

```bash
$ npx tsc --noEmit
# No errors, compilation successful! (Exit Code: 0)
```

### ESLint Verification

```bash
$ npm run lint
# 0 errors, all files fully lint-compliant! (Exit Code: 0)
```

### Security Test Results

```bash
$ npx vitest run tests/security/
✓ tests/security/case-study-token-authz.test.ts (12 tests)
✓ tests/security/public-routes-tenant-context.test.ts (19 tests)
✓ tests/security/proposal-auto-ready.test.ts (12 tests)
...
Test Files  12 passed (12)
     Tests  177 passed (177)
  Duration  5.65s
```

---

## Remaining Risks

- **None identified**. The authorization flows are secured with high-entropy timing-safe validation, tenant/audit scope checks, and double-gate print-page enforcement. No tokens or secrets are logged.
