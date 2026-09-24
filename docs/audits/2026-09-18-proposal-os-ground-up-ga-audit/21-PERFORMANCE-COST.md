# Performance & Cost

No authorized live provider/runtime dataset was available, so p50/p95/p99, concurrency, cold start, queue delay, cost/audit, and cost/proposal are **NOT_EVIDENCED**.

Source-level cost accounting exists (`apiCostCents`, cost tracker, provider/module instrumentation) and the runner has bounded concurrency/timeouts. Those are implementation hooks, not measured economics. The 90-second README claim and any historical low-cost claims are not current evidence.

The architecture likely bottlenecks on provider quotas, browser/Chromium work, LLM calls, DB pool/RLS overhead, and Cloud Run worker capacity. Required qualification is staged load at 1/10/50/100 concurrent audits with provider quotas, queue depth, DB pool, p95 latency, failure/degraded rate, and fully loaded marginal cost.
