# Risk Register

| ID | Severity | Risk | Current state | Owner/action | Gate |
| --- | --- | --- | --- | --- | --- |
| PEOS-SEC-001 | BLOCKER | Client session update can overwrite role/tenant claims | Source-confirmed | Patch server-derived JWT claims and add exploit regression | Security |
| PEOS-SEC-002 | BLOCKER | Tenant `*` API key can target another tenant in destructive routes | Source-confirmed | Separate platform admin credential; bind key to own tenant | Tenancy |
| PEOS-SEC-003 | BLOCKER | Raw tenant header accepted as identity | Source-confirmed | Remove unauthenticated header authority; centralize trusted context | Tenancy |
| PEOS-SEC-004 | CRITICAL | Any non-empty ops header bypasses quota | Source-confirmed | Compare only configured secret | Cost/external effects |
| PEOS-SEC-006 | BLOCKER | Public status route can mutate proposal lifecycle | Source-confirmed | Remove/restrict route; atomic acceptance workflow | Commercial |
| PEOS-AUDIT-001 | BLOCKER | Cache hit does not materialize target audit | Source-confirmed | Disable or clone complete result transactionally, tenant/config key | Functional core |
| PEOS-AUDIT-003 | CRITICAL | Provider failure can be reported complete/negative | Source-confirmed | Canonical execution state and unknown rendering | Trust |
| PEOS-AUDIT-005 | CRITICAL | Finding runtime contract disagrees with DB | Source-confirmed | Align schema/contracts/migrations and live replay | Data |
| PEOS-AUDIT-006 | HIGH | Evidence writes nonfatal/outside transaction | Source-confirmed | Atomic snapshot/finding result or explicit unavailable status | Evidence |
| PEOS-COM-001 | BLOCKER | Payment can succeed without acceptance/fulfillment | Source-confirmed | Idempotent order/fulfillment state machine and reconciliation | Billing |
| PEOS-COM-003 | BLOCKER | Fulfillment executor unavailable | Source-confirmed | Build executor or explicitly scope to human delivery | Product |
| PEOS-CI-002 | HIGH | Lint fails 179 errors | Reproduced local | Fix/configure lint and make required in CI | Build |
| PEOS-TEST-001 | HIGH | Full tests cannot run without DB | Reproduced local | Provision isolated CI/staging DB and split deterministic suites | Verification |
| PEOS-PROV-001 | HIGH | Runtime/deployment not observable due auth refresh | Blocked | Reauthenticate and capture exact chain | Provenance |
| PEOS-INFRA-002 | HIGH | Restore not demonstrated | Not evidenced | Isolated DB/object restore drill | Operations |
