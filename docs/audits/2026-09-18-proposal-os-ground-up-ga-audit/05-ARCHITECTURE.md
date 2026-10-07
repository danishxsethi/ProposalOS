# Architecture Assessment

| Area | Decision | Rationale |
| --- | --- | --- |
| Next.js + Prisma core | HARDEN | Broad working surface and successful production build; auth/context and schema drift need closure |
| Shared module manifest | KEEP | 27-module registry/manifest alignment is a useful canonical boundary |
| AuditJob queue | HARDEN | Durable primitives exist; direct callers must converge and live worker recovery must be proven |
| Multiple audit entry paths | REFACTOR | Keep public/API compatibility but route all execution through one dispatcher |
| LangGraph diagnosis/proposal | HARDEN | Strong structured graph boundary; degraded-state and evidence input contracts need tightening |
| Parallel proposal QA implementations | REDESIGN | One publication predicate must own READY/PUBLISHED/SENT eligibility |
| Public token surfaces | REDESIGN | Central access/expiry/projection helper required |
| Email implementations | REFACTOR | Multiple senders have inconsistent escaping, idempotency, suppression, and simulation states |
| Stripe/payment/fulfillment | REDESIGN | One idempotent order/project/fulfillment state machine required |
| Delivery executor | REBUILD or DEFER | Current source explicitly has no approved executor; do not market autonomy until implemented |
| Temporal | DEFER | Current architecture chose LangGraph/DB queue; add only after measured durability/scale need |
| n8n/Dify | REMOVE from claimed core until evidenced | No current production boundary was verified |
| Terraform/deploy scripts | HARDEN | Documented infrastructure cannot substitute for applied state/provenance |

The main architectural problem is not lack of components. It is multiple partially overlapping execution and policy paths whose status, tenant, evidence, and external-effect semantics do not converge.
