# Temporal / Reliability Assessment

## Current orchestration truth

Temporal is not present in `package.json` and no Temporal workflow/worker source was found. The diagnosis graph comment explicitly says native LangGraph is used and Temporal is deferred. Therefore claims that Temporal is complete or production-owned are not current implementation truth.

The source has a database-backed AuditJob queue with idempotency keys, retries, leases, heartbeat, reclaim, and worker authentication. This is a meaningful reliability substrate, but it is not universal: delivery graph, pipeline audit stage, and automated outreach directly call `runAudit()`.

## Failure risks

- cache hit can leave audit QUEUED with no findings/proposal;
- direct execution bypasses queue retry/lease/reclaim;
- external email/payment/CRM effects need durable idempotency and reconciliation;
- payment webhook swallows delivery trigger failure after returning success;
- worker crash/redeploy, stale worker, provider 429, DB outage, and duplicate external effects were not live-injected.

**State:** `PARTIALLY_IMPLEMENTED`.

Keep the database queue for the defined audit/proposal scope unless measured requirements justify Temporal. First converge all callers, make external effects idempotent, and prove crash/retry behavior in isolated staging.
