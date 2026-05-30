# Remediation 005 — Proposal Auto-READY Status Promotion

**Date:** 2026-05-14  
**Status:** COMPLETE  
**Blocker resolved:** GA Blocker from Completion Audit 2026-05-14 — proposals always saved as DRAFT  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## Original Issue

`lib/proposal/runner.ts` (the background/batch proposal generation path) unconditionally saved every generated proposal as `status: 'DRAFT'`, regardless of QA results. The interactive route `app/api/audit/[id]/propose/route.ts` already had auto-READY logic (`qaStatus.score >= 60 ? 'READY' : 'DRAFT'`), but:

1. The runner never called `runAutoQA` at all.
2. The runner hardcoded `status: 'DRAFT'` in the `prisma.proposal.create` call.
3. The regenerate route `app/api/audit/[id]/regenerate/route.ts` also hardcoded `status: 'DRAFT'` and never ran QA.
4. The threshold `60` was an inline magic number in the route, not a shared constant.

---

## Readiness Criteria Implemented

A proposal is promoted to `READY` if and only if:

```
qaStatus.score >= PROPOSAL_READY_THRESHOLD (60)
```

Where `qaStatus` is the result of `runAutoQA(proposal, findings, businessName, city, context)`.

The `runAutoQA` function already enforces hard-fail conditions that force the score to 0:

- `WRONG_BUSINESS_OR_CITY` — summary doesn't mention the business name or city
- `UNCITED_CRITICAL_CLAIMS` — critical findings have no valid evidence
- `GENERIC_SUMMARY_NO_IMPACT` — fewer than 3 quantified metrics + no impact language
- `TIER_MAPPING_INVALID` — tier IDs don't map to real findings, or tiers have < 2 findings

Any hard-fail → score = 0 → `DRAFT`. No special-casing needed.

**Threshold:** `PROPOSAL_READY_THRESHOLD = 60` (matches the existing route logic, now extracted to a named constant).

---

## Files Changed

| File                                                 | Change                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/proposal/status.ts`                             | **New** — `determineProposalStatus(qaStatus)` helper + `PROPOSAL_READY_THRESHOLD` constant                                                                                                                                                 |
| `lib/proposal/runner.ts`                             | Added `runAutoQA` call; replaced hardcoded `'DRAFT'` with `determineProposalStatus(qaStatus)`; added QA fields to `prisma.proposal.create`; updated metrics/audit-trail to use actual status; added `status` and `qaScore` to return value |
| `app/api/audit/[id]/propose/route.ts`                | Replaced inline `qaStatus.score >= 60 ? 'READY' : 'DRAFT'` with `determineProposalStatus(qaStatus)` from shared helper                                                                                                                     |
| `app/api/audit/[id]/regenerate/route.ts`             | Added `runAutoQA` call; replaced hardcoded `'DRAFT'` with `determineProposalStatus(qaStatus)`; added QA fields to `prisma.proposal.create`; added `status` and `qaScore` to response                                                       |
| `tests/security/proposal-auto-ready.test.ts`         | **New** — 12 tests covering READY/DRAFT/hard-fail/generation-failure/tenant-isolation paths                                                                                                                                                |
| `tests/security/audit-regenerate-authz.test.ts`      | Updated — added `runAutoQA` mock; fixed tier fixture data; updated assertion to expect `status: 'READY'` in response                                                                                                                       |
| `docs/remediation/005-proposal-auto-ready-status.md` | This file                                                                                                                                                                                                                                  |

---

## Exact Diffs (summary)

### `lib/proposal/status.ts` (new)

```typescript
export const PROPOSAL_READY_THRESHOLD = 60;

export function determineProposalStatus(qaStatus: QAStatus): 'READY' | 'DRAFT' {
  return qaStatus.score >= PROPOSAL_READY_THRESHOLD ? 'READY' : 'DRAFT';
}
```

### `lib/proposal/runner.ts`

```diff
+import { determineProposalStatus } from '@/lib/proposal/status';
+import { runAutoQA } from '@/lib/qa/autoQA';

 // Use complete proposal if available, otherwise fall back to old format
 const finalProposal = proposalGraphState.completeProposal || proposalResult;

+// Step 3: Run automated QA to determine proposal status.
+const qaStatus = runAutoQA(finalProposal, audit.findings, audit.businessName, audit.businessCity, { ... });
+const proposalStatus = determineProposalStatus(qaStatus);
+logger.info({ event: 'proposal.status.decided', qaScore: qaStatus.score, status: proposalStatus }, ...);

-// Step 3: Save proposal to database
+// Step 4: Save proposal to database
 const proposal = await prisma.proposal.create({
   data: {
     ...
-    status: 'DRAFT',
+    status: proposalStatus,
+    qaScore: qaStatus.score,
+    clientScore: qaStatus.clientPerfect.score,
+    qaResults: JSON.parse(JSON.stringify(qaStatus)),
+    clientScoreResults: JSON.parse(JSON.stringify(qaStatus.clientPerfect)),
   },
 });

-MetricsRecorder.proposalGenerated(audit.tenantId, 'DRAFT', undefined);
+MetricsRecorder.proposalGenerated(audit.tenantId, proposalStatus, undefined);

-payload: { status: 'DRAFT', ... }
+payload: { status: proposalStatus, qaScore: qaStatus.score, ... }

-return { success: true, auditId, proposalId: proposal.id, webLinkToken: proposal.webLinkToken, costCents: ... };
+return { success: true, auditId, proposalId: proposal.id, webLinkToken: proposal.webLinkToken, status: proposalStatus, qaScore: qaStatus.score, costCents: ... };
```

### `app/api/audit/[id]/propose/route.ts`

```diff
+import { determineProposalStatus } from '@/lib/proposal/status';

-const proposalStatus = qaStatus.score >= 60 ? 'READY' : 'DRAFT';
+const proposalStatus = determineProposalStatus(qaStatus);
```

### `app/api/audit/[id]/regenerate/route.ts`

```diff
+import { determineProposalStatus } from '@/lib/proposal/status';
+import { runAutoQA } from '@/lib/qa/autoQA';

+const qaStatus = runAutoQA(proposalResult, audit.findings, audit.businessName, audit.businessCity, { industry: audit.businessIndustry });
+const proposalStatus = determineProposalStatus(qaStatus);

 const proposal = await prisma.proposal.create({
   data: {
     ...
-    status: 'DRAFT',
+    status: proposalStatus,
+    qaScore: qaStatus.score,
+    clientScore: qaStatus.clientPerfect.score,
+    qaResults: JSON.parse(JSON.stringify(qaStatus)),
+    clientScoreResults: JSON.parse(JSON.stringify(qaStatus.clientPerfect)),
   },
 });

 return NextResponse.json({
   ...
+  status: proposalStatus,
+  qaScore: qaStatus.score,
 });
```

---

## Downstream Status Assumptions

Checked all downstream code that reads proposal status:

| Location                                         | Assumption                                                         | Impact of this change                                       |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `app/api/proposal/token/[token]/route.ts`        | Accepts `DRAFT`, `READY`, `SENT`, `VIEWED`, `ACCEPTED`, `REJECTED` | ✅ No change needed — READY is already in the valid list    |
| `app/api/proposal/token/[token]/status/route.ts` | Status transitions                                                 | ✅ No change needed — READY is a valid transition target    |
| `app/api/proposal/id/[id]/closeability/route.ts` | Checks `DRAFT` or `READY` before updating                          | ✅ No change needed — handles both                          |
| `app/api/stripe/webhook/route.ts`                | Sets `PAID` on checkout                                            | ✅ No change needed — PAID comes after READY                |
| `app/api/proposal/token/[token]/accept/route.ts` | Checks for `ACCEPTED`                                              | ✅ No change needed                                         |
| Dashboard/share routes                           | Read proposal status                                               | ✅ No change needed — READY proposals are already shareable |

No downstream code assumes all generated proposals are DRAFT. The `READY` status was already in the schema and handled by all routes.

---

## Commands Run and Outputs

```bash
npx vitest run tests/security/proposal-auto-ready.test.ts
# → Test Files  1 passed (1)
# → Tests  12 passed (12)

npx vitest run tests/security/
# → Test Files  6 passed (6)
# → Tests  45 passed (45)
```

---

## Remaining Risks

1. **`runAutoQA` in the runner adds latency.** The background runner now runs QA synchronously before saving. For large proposals this adds ~10–50ms. Acceptable for correctness; can be optimized later if needed.

2. **`runProposalPipeline` (used by regenerate) returns a different type than the LangGraph path.** The regenerate route uses `runProposalPipeline` while the propose route uses `invokeProposalGraphWithTimeout`. Both now run QA, but the QA inputs may differ slightly in structure. The `runAutoQA` function handles both via duck-typing on `findingIds`.

3. **QA threshold is 60, not 90.** The route's existing threshold was 60 (not the "agency-grade" 90 mentioned in some docs). This is intentional — 60 is the minimum for READY; 90 is the target for "agency-grade" quality. Proposals between 60–89 are READY but may have warnings.

---

## Acceptance Criteria Status

| Criterion                                                         | Status                         |
| ----------------------------------------------------------------- | ------------------------------ |
| `lib/proposal/runner.ts` no longer unconditionally saves as DRAFT | ✅                             |
| Valid proposals (QA >= 60) persisted as READY                     | ✅                             |
| Invalid/low-quality proposals not persisted as READY              | ✅                             |
| API response reflects persisted status                            | ✅                             |
| Tests cover READY and non-READY paths                             | ✅ (12 new tests)              |
| No tenant isolation regression                                    | ✅ (45/45 security tests pass) |
| No production/staging/cloud resources touched                     | ✅                             |
| No secrets changed                                                | ✅                             |
