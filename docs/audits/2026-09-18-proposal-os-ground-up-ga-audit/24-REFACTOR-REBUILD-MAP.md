# Refactor / Rebuild Map

| Component | Disposition | Work |
| --- | --- | --- |
| Finding/evidence contracts | REFACTOR | Align runtime and Prisma types; add snapshot schema and transaction semantics |
| Audit cache | REDESIGN | Tenant/config keyed complete-result cache or disable until materialization is correct |
| Audit adapter registry | REFACTOR | One normalized execution state; no adapter can launder failure as complete |
| Audit callers | REFACTOR | All production execution via dispatcher/worker |
| Diagnosis/proposal graph | HARDEN | Explicit degraded/failed states, same input contract, versioned prompts/models |
| Proposal QA/publication | REDESIGN | One persisted canonical gate and claim coverage across rendered sections |
| Public proposal access | REBUILD boundary | One token access helper, expiry/publication, redacted projection, rate limits |
| Auth/tenant context | REBUILD boundary | Server-derived claims/context, platform-admin separation, route matrix |
| Email | REFACTOR | One provider/outbound safety/idempotency/simulation state |
| Stripe + fulfillment | REDESIGN | Payment/order/project/task state machine with retries/reconciliation |
| Delivery executor | REBUILD or REMOVE claim | Implement approved adapters or remove autonomous fulfillment claims |
| Retention | REFACTOR | One canonical route/graph and durable occurrences |
| Learning | REFACTOR | Explicit tenant-local vs anonymized-global scope; exact sample statistics |
| CI | HARDEN | Add typecheck script, fix lint, DB/integration jobs, artifact provenance |
| Infra/restore | HARDEN | Apply/verify IaC, immutable digest, secret/IAM evidence, restore drill |
