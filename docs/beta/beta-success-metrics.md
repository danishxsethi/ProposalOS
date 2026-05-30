# Beta Success Metrics — Paid Closed Beta

This document establishes the objective, quantitative performance indicators (KPIs) and operational safety thresholds that must be met during the ProposalOS Paid Closed Beta window to justify graduation to a General Availability (GA) candidate state.

> [!NOTE]
>
> - **Primary Objective**: Demonstrate system stability, multi-tenant safety, and pricing integration correctness under restricted beta load before scaling production.

---

## 1. Metric Targets Matrix

| Metric Dimension                 |  Paid Closed Beta Target  | General Availability (GA) Target | Measurement Tool / Query              |
| :------------------------------- | :-----------------------: | :------------------------------: | :------------------------------------ |
| **Total Audits Completed**       |  &ge; 20 successful runs  |     &ge; 500 successful runs     | `SELECT count(*) FROM "ProspectLead"` |
| **Audit Success Rate**           |    &ge; 90% completion    |       &ge; 98% completion        | DB Completed vs Failed ratio          |
| **p95 Audit Latency**            |      &le; 90 seconds      |         &le; 45 seconds          | Prometheus trace histograms           |
| **Manual Proposal QA Score**     |  &ge; 8.0 / 10.0 average  |     &ge; 9.0 / 10.0 average      | `scripts/qa-review.ts`                |
| **Hallucination Rate**           | 0% in final deliverables  |    &le; 0.5% in public drafts    | Spot audits + LLM quality logs        |
| **Manual Edit Rate**             |  Tracked only (no limit)  |     &le; 10% edits required      | Edit tracker logs                     |
| **Email Deliverability**         |  100% test routing safe   |    &ge; 99% open / inbox rate    | Resend domain dashboard               |
| **Billing Correctness**          |     100% Stripe match     |        100% Stripe match         | Webhook reconciliation script         |
| **Tenant Isolation Issues**      |      **Strictly 0**       |          **Strictly 0**          | `scripts/rls-smoke-test.ts`           |
| **Severity-1 Incidents**         |      **Strictly 0**       |          **Strictly 0**          | Incident logging tracker              |
| **Cost Per Audit**               |  &le; $1.00 USD average   |      &le; $0.50 USD average      | `CostTracker.totalCents`              |
| **Customer Satisfaction (CSAT)** | &ge; 80% positive (Slack) |     &ge; 92% positive (NPS)      | Slack feedback survey                 |
| **Close / Conversion Rate**      |      N/A (untracked)      |      &ge; 15% booking rate       | Lead tracking analytics               |

---

## 2. Hard Safety Thresholds for Paid Closed Beta

To protect user trust, system security, and API budget allocations, we enforce the following hard boundaries:

### Operational Safety Thresholds

- **Zero Tenant Data Cross-Contamination**: Any database exception or RLS assertion failure halts the beta.
- **Zero Real Charge Risk**: Staging must remain strictly within Stripe test mode (`sk_test_*`). If an operator triggers an accidental live session without approval, the beta is frozen.
- **Zero Public Outreach Leaks**: No cold outreach emails may be sent to public prospect targets. 100% of outreach events must route to internal test mailboxes.
- **Zero Sev-1 Incidents**: Uptime must remain at &ge; 99.9% over the 14-day testing window.

---

## 3. How to Gather Performance Telemetry

### Evaluating Audit Completion Rates

```sql
SELECT
  "pipelineStatus",
  count(*) as count,
  round(100.0 * count(*) / SUM(count(*)) OVER (), 2) as percentage
FROM "ProspectLead"
WHERE "createdAt" > NOW() - INTERVAL '14 days'
GROUP BY "pipelineStatus";
```

### Reviewing Average Cost per Audit

```sql
SELECT
  round(avg("costCents") / 100.0, 4) as avg_cost_usd
FROM "PipelineCostLog"
WHERE "createdAt" > NOW() - INTERVAL '14 days';
```

### Confirming Multi-Tenant DB Safety

```bash
# Run the authoritative pgBouncer RLS smoke suite locally
npx ts-node scripts/rls-smoke-test.ts
```
