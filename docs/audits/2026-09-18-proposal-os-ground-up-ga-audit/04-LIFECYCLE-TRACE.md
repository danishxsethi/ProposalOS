# Autonomous Agency Lifecycle Trace

## Source trace

The current source-level causal chain is:

```text
POST /api/audit
  -> getTenantId / auth middleware
  -> Audit row QUEUED
  -> dispatchAuditExecution
  -> AuditJob row
  -> worker route / processAuditJob
  -> runAudit / MODULE_REGISTRY
  -> module result normalization
  -> Finding validation and persistence
  -> EvidenceSnapshot writes
  -> Audit final status
  -> runProposalForAudit (worker for COMPLETE/PARTIAL)
  -> diagnosis LangGraph
  -> proposal LangGraph
  -> claim/QA evaluation
  -> Proposal row and publication status
  -> hosted token/PDF/email/checkout routes
```

## Breaks and uncertainty

- **Queue to runner:** source and mocked tests exist; running worker/revision not observed.
- **Runner to findings:** cache hits can return before target audit status/findings/evidence are materialized (`PEOS-AUDIT-001`). Partial results are accepted by contract but not extracted (`PEOS-AUDIT-004`).
- **Provider to finding:** several adapters report complete after failure; unknown/negative semantics are not invariant (`PEOS-AUDIT-003`).
- **Finding to diagnosis:** source requires audit/tenant identity and validates findings; HTTP diagnosis returns 200 for degraded/error states (`PEOS-COM-004`).
- **Diagnosis to proposal:** HTTP and worker paths do not pass identical evidence/comparison inputs.
- **Proposal to publication:** multiple QA predicates disagree; customer-facing sections are not fully claim-bound.
- **Publication to delivery:** public token surfaces have inconsistent access/expiry and public status mutation.
- **Checkout to fulfillment:** payment can be recorded while acceptance/task creation/execution is absent or swallowed (`PEOS-COM-001`).
- **Fulfillment to retention/learning:** executor and verification are unavailable; retention graph/route are disconnected and learning is not tenant-scoped.

No real authorized business trace with IDs was run because live database/provider/runtime access was unavailable. This is `NOT_EVIDENCED`, not a claim that no trace can work.
