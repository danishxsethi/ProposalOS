# GA Gate Scorecard

| Gate | Status | Evidence / blocker |
| --- | --- | --- |
| Canonical source identity | PASS | Git HEAD/tree frozen locally |
| Immutable deployment provenance | BLOCKED | No image digest/revision/traffic; GCP reauth required |
| Deterministic build | PASS with limitations | Build passes; mutable latest/cache and local deploy path remain |
| Functional audit core | FAIL | Cache/state and adapter failure defects |
| Evidence integrity | FAIL | Nonfatal snapshots, rejected legacy shapes, unknown/negative ambiguity |
| Findings/schema integrity | FAIL | Runtime/Prisma type mismatch |
| Diagnosis trust | FAIL | Degraded 200 path and no live trace |
| Proposal/claim integrity | FAIL | Split gates, incomplete claim coverage, public raw projection |
| Proposal QA gate | FAIL | Multiple predicates and unavailable QA ambiguity |
| Authentication | FAIL | Session claim merge and public route issues |
| Authorization/tenant isolation | FAIL | Header/API-key/public route defects; live RLS unproven |
| Durable workflows | FAIL | Queue exists but direct callers bypass; Temporal absent |
| External effects | FAIL | Payment/fulfillment discontinuity; mock send semantics |
| Backups/restore | NOT_EVIDENCED | Documentation only |
| Observability | NOT_EVIDENCED | Source exists; LangSmith disabled locally; no runtime trace |
| Performance/cost | NOT_EVIDENCED | No live measurement dataset |
| UX/accessibility | NOT_EVIDENCED | No browser/runtime evidence |
| Commercial readiness | FAIL | Fulfillment unavailable; checkout/onboarding linkage incomplete |
| Real-world shakedown | BLOCKED | No authorized runtime/provider access |
| Final GA declaration | FAIL | Named blocker gates unresolved |

**GA result:** `GA_BLOCKED_BY_NAMED_GATES`.
