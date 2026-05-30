# Pilot Onboarding Checklist — Paid Closed Beta

This checklist outlines the rigorous, multi-gate technical and operational onboarding process for a new paid closed beta tenant of ProposalOS. Every step must be executed in order and verified by the designated operator.

> [!IMPORTANT]
>
> - **Capped Cohort Boundary**: This paid closed beta is strictly limited to 1–5 authorized operator-led tenants. No self-service registration is allowed.
> - **No Live Billing/Outreach**: Stripe must remain in test mode (`sk_test_*`) and email sending must remain isolated using the developer verification class unless explicit, separate operator approval is granted.

---

## Onboarding Matrix

| Action Item              | Verification Command / Target       | Owner          | Status |
| :----------------------- | :---------------------------------- | :------------- | :----: |
| Tenant Provisioning      | `prisma.tenant.create({ ... })`     | Database Admin | `[ ]`  |
| Operator Seat Invitation | Admin console/invite link           | Operator       | `[ ]`  |
| Role Assignment          | Check `role = 'ADMIN' / 'MEMBER'`   | Operator       | `[ ]`  |
| Allowed Widget Origins   | DB Allowlist Check                  | Security Sec   | `[ ]`  |
| Quota Constraints        | DB `AuditQuota` set to `25/day` max | Operator       | `[ ]`  |

---

## 1. Before Onboarding

### Phase A: Database & Access Control

- [ ] **Tenant Provisioning**: Seed the new tenant within the main database. Ensure a unique UUID is assigned and verified.
- [ ] **Operator Seat Invite**: Invite the designated tenant administrator. Confirm NextAuth magic links are sent only via standard debug mailers or Resend sandbox.
- [ ] **RBAC Assignment**: Validate that the user role is securely assigned. Run:
  ```sql
  SELECT email, role, "tenantId" FROM "User" WHERE email = 'tenant-admin@email.com';
  ```
- [ ] **Widget Origins Configuration**: If the client is embedding the lead generation widget, verify that their specific domain is explicitly added to the allowlist in the database:
  ```sql
  SELECT * FROM "WidgetOriginAllowlist" WHERE "tenantId" = 'tenant-uuid';
  ```

### Phase B: Environment & Integrations Compliance

- [ ] **Stripe Key Mode Check**: Confirm that `STRIPE_SECRET_KEY` in the environment starts with `sk_test_`. Real charging must be disabled.
- [ ] **Email Mode Compliance Check**: Confirm that `RESEND_API_KEY` is configured as a test sandbox key (`re_*`). Check that `PHASE_Z_EMAIL_RECIPIENT` is configured to point solely to internal developer verification targets (e.g., `danishsethi@icloud.com`).
- [ ] **Rate Limiting Checks**: Confirm Redis rate limiter is active and `UP` by running `redis-cli ping` on the staging network.

---

## 2. First-Session Walkthrough

To declare the tenant fully onboarded, the operator must execute a live trial session.

- [ ] **Initial Test Audit**:
  1. Trigger an audit for a sample sandbox company via the admin API or dashboard:
     ```bash
     curl -X POST http://localhost:3001/api/audit \
       -H "Content-Type: application/json" \
       -H "x-api-key: your-api-key" \
       -d '{"name": "Sandbox Plumbers", "city": "Chicago"}'
     ```
  2. Confirm the audit initiates cleanly, records in the queue, and transition state from `QUEUED` to `RUNNING`.
- [ ] **Manually Inspect Proposal Output**:
  - Open the generated proposal: `http://localhost:3001/api/proposal/token/<token>`.
  - Manually review all 3 pricing tiers (Starter, Growth, Premium) to ensure realistic numbers.
- [ ] **Manual Proposal Quality Audit (QA)**:
  - Run the quality scorer locally to evaluate formatting, accuracy, and depth:
    ```bash
    npx ts-node scripts/qa-review.ts --proposal-id=<id>
    ```
  - Verify that the average proposal quality score is **&ge; 8.0 / 10.0** before passing.
- [ ] **Multi-Tenant Exposure Check**:
  - Run a database assertion to confirm that no other tenant data was touched or exposed during this session:
    ```bash
    npx ts-node scripts/rls-smoke-test.ts
    ```
- [ ] **Billing Event Validation**:
  - Open the Stripe Dashboard in test mode and confirm that the Checkout Session was created under the correct tenant metadata with zero live payment risk.

---

## 3. Daily Operational Verification

The operator must perform these inspections daily during the beta window:

- [ ] **Audit Volumetric Audit**: Ensure total audits do not exceed the hard limit of **25 audits/day** per tenant.
- [ ] **Error Rate Analysis**: Check `PipelineErrorLog` for any failures. Run:
  ```sql
  SELECT count(*), stage FROM "PipelineErrorLog" WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY stage;
  ```
- [ ] **Budget Compliance**: Check `CostTracker.totalCents` in database telemetry. Confirm total Daily API cost for LLMs remains under **$50.00**.
- [ ] **Security Logs Inspection**: Audit the non-repudiation log for any unauthorized cross-tenant operations or unusual tokens.

---

## 4. Exit Criteria

This pilot tenant is considered "Beta-Validated" and ready for GA transition when:

- [ ] **Audit Success Rate**: Maintain **&ge; 90%** successful completion over 10 consecutive trials.
- [ ] **Latency Profile**: P50 latency stays below **60 seconds**, with p95 below **90 seconds**.
- [ ] **Zero RLS Violations**: Zero database-level tenant isolation exceptions logged.
- [ ] **Stripe Correctness**: Clean webhook verification for 100% of test checkout cycles.
- [ ] **Email Safety**: Zero emails sent to public prospect targets (100% sandboxed).
