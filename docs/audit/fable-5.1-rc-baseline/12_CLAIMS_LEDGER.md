# 12 — Claims Ledger — Fable 5.1

| Claim | Source | Audience | Measured | Status | Action |
|---|---|---|---|---|---|
| 27 audit modules | packages/shared, runner MODULE_REGISTRY | customer/arch | 27 registered, 27 real | VERIFIED | safe to publish with rollout flags note |
| Evidence-bound proposals zero hallucination | proposal/grounding, Publication fingerprint | customer | Contract enforced, but no 5-industry live eval on this HEAD | PARTIAL | change to "evidence-grounded with adversarial QA; eval pending" until WS5 |
| RLS tenant isolation | prisma schema + lib/prisma.ts | security reviewer | Policies forced, client single $extends; hostile pair NOT RUN | CLAIMED_BUT_UNPROVEN | do not claim "proven" until pair test |
| Fast audits <60s | marketing copy | customer | UNVERIFIED (no p50/p95) | UNSUPPORTED | remove or add 95th percentile from WS7 |
| SOC2/GDPR compliant | implied by RLS + blocklist | buyer | Controls partial, no cert artifact | MISLEADING | downgrade to "controls implemented: RLS, blocklist, unsubscribe, no cert" |
| Stripe billing idempotent | webhook handler | customer | Sig verify + dedup proven in code/tests | VERIFIED* | safe, but keep alias note |

Public RC requires one canon story across marketing/UI/docs/pricing/sales/API/emails/Notion.
