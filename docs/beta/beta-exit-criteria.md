# Beta Exit Criteria — Paid Closed Beta

This document defines the clear, absolute checklist requirements to exit the ProposalOS Paid Closed Beta phase and graduate to a General Availability (GA) candidate, as well as the emergency triggers that require an immediate pause or termination of the beta program.

---

## 1. Requirements to Graduate from Beta to GA Candidate

To transition the system to GA readiness and prepare for unrestricted production traffic, the following gates must be cleared and signed off by the platform operator:

### Technical Stability & Scalability

- [ ] **Chronological Validation**: The system has run stably in a staging/sandbox environment for &ge; 14 consecutive days (or agreed 30-day window).
- [ ] **Throughput Milestone**: Successfully completed &ge; 100 consecutive audits without a critical failure.
- [ ] **Latency Profiles Met**: p50 latency is &le; 60 seconds, and p95 latency is &le; 90 seconds.
- [ ] **Rollback Drill Completed**: Operator has successfully executed a dry-run or simulated rollback using:
  ```bash
  ./scripts/rollback.sh --dry-run
  ```

### Functional Quality & Deliverables

- [ ] **Proposal Excellence**: 100% of generated proposals pass manual quality check with an average score of **&ge; 8.0/10.0** on `scripts/qa-review.ts`.
- [ ] **Zero Hallucinations**: Zero instances of hallucinated facts, missing pricing data, or broken markdown tables found in final user-facing PDFs.
- [ ] **Email Outreach Verification**: 100% of sandboxed emails successfully sent, with headers and unsubscribe paths validated against CAN-SPAM regulations.

### Integrations, Billing, & Safety

- [ ] **Billing Reconciliation Clean**: Webhook handlers successfully reconciled 100% of test Stripe sub events, with zero missing transactions.
- [ ] **No Secret Leakage**: Static secret scans pass with 0 findings of hardcoded credentials in git or build logs.
- [ ] **Monitoring Proven**: All alerts defined in the `monitoring-alerting-checklist.md` have been configured, synthetically triggered, and verified.

---

## 2. Emergency Triggers to Pause or Halt the Beta

If any of the following events occur, the operator must execute the **Emergency Freeze Runbook** immediately. The beta program will remain blocked until a thorough root-cause analysis is completed and approved.

### 🔴 Trigger 1: Tenant Data Exposure or Isolation Breach

- **Definition**: Any database-level or query-level leak where Tenant A is exposed to Tenant B's data, or `rls-smoke-test` outputs a failure.
- **Action**: Immediate freeze. Disable public routing, halt workers, block sessions.

### 🔴 Trigger 2: Billing Integrity / Duplicate Charging Failure

- **Definition**: Any failure in Stripe checkout processing causing duplicate accounts, missing webhook status synchronization, or incorrect pricing mappings.
- **Action**: Disable Stripe integration. Revert checkout endpoints.

### 🔴 Trigger 3: Email Safety / Sandboxing Leak

- **Definition**: Any cold outreach email sent to an external, real-world customer or prospect instead of the designated `PHASE_Z_EMAIL_RECIPIENT` test mailbox.
- **Action**: Instantly revoke Resend API keys, pause outreach stage in DB.

### 🔴 Trigger 4: Hardcoded Production Secrets Detected

- **Definition**: Discovery of any live secret keys (`sk_live_*`, real SMTP credentials, active JWT keys) hardcoded in git commit history, logs, or docker layers.
- **Action**: Rotate all secrets immediately, purge git history.

### 🔴 Trigger 5: Runaway LLM Costs

- **Definition**: Cumulative token costs exceeding **$100.00 USD** within a single 24-hour cycle.
- **Action**: Pause asynchronous audit workers.

### 🔴 Trigger 6: Unacceptable Output Hallucination Rate

- **Definition**: If &ge; 10% of generated proposals contain critical quality errors (e.g. nonsense business diagnosis, empty pricing packages, scrambled markdown rendering).
- **Action**: Pause proposal generation endpoints and adjust prompt models.
