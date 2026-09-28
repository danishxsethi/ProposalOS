# 10 — Reliability Chaos and Recovery — Fable 5.1 Full Advancement

**Queue durability:** AuditJob idempotencyKey unique + leaseToken only-holder completion proven by architecture test; reclaim not load-tested.

**Recovery drills:** crash-kill-mid-phase, graceful drain, DLQ poison-fast not yet scripted — harness exists via AuditJob lease/heartbeat 6m/1m.

**Kill switches:** OUTREACH_LIVE_SENDING double-gated sandbox default, KILL_SWITCH pending runbook rehearsal.
