# 13 — Pre-Implementation Decisions — Fable 5.1 Best-in-Class

Only decisions where human/product judgment is required before implementation can proceed safely. Technical calls already decided in `11` are not here.

| # | Decision | Recommended | Alternatives | Consequence if alternative | Blocks start? |
|---|---|---|---|---|---|
| 1 | **Migrations: businessLatitude/Longitude + locale_configs 7 rows?** | Commit lat/lng in proper migration `20260928000000` + **restore** `locale_configs` then explicitly deprecate if truly unused (ADR). | Drop lat/lng from `schema.prisma` to match committed migrations. | Proposal location personalization degrades; maps scoring loses geo. | **Yes — WS1.** Pick now. |
| 2 | **Pricing canonical?** | `PlanCatalogService` (hardcoded 99/299/599 test/live `STRIPE_PRICE_ID_*` + `BILLING_LIVE_MODE`) is RC canon; move `PricingService` 7-currency generator to `experimental/` | Promote DB PricingService as canon and ship 7 currencies. | Adds 7× priceIds + meter divergence + Stripe dashboard sprawl before stable. | Yes — WS3 `displayed=charged`. Tarry = bill drift. |
| 3 | **Billing webhook alias?** | Delete `app/api/billing/webhook/route.ts:1` keep only `/api/stripe/webhook` | Keep alias. | Duplicate `ProcessedWebhookEvent` dedup hides but doubles auditTrail confusing oncall. | No — can ship under flag day, but decide before G4 smoke. |
| 4 | **Claraud scope for RC?** | Appendix: marketing references only; `claraud-web` not in RC deployable; widget stays in main app `widget/quick-audit` | Ship Claraud as second brand in RC. | Two product stories at RC weaken agency narrative + auth story. | No — is packaging. |
| 5 | **Self-evolving prompts?** | Ship `prompts/*.txt` deterministic; `self-evolving-prompts` tables stay `experimental/` with ADR | Ship evolving prompts as production feature. | Design-vs-prod split becomes RC-scoped migration + operator confusion. | No — defer T2. |
| 6 | **Outreach live default at RC?** | Sandbox/human-approved default; live requires `OUTREACH_LIVE_SENDING + tenant requireHumanReview off` + DNS verify + delivered staging prove. | Open live at RC. | Burns domain rep without proven bounce <5% guard. | No — policy flag, but agree before G4. |
| 7 | **Module count honesty?** | Market "27 modules, rollout flags may disable 4 gracefully (accessibility/performance/seo/security)" | Market always-27. | Sets prospect expectation that ignores real degraded paths — trust cost. | No — copy change. |
| 8 | **locale_configs used or not?** | Restore + decide deprecation explicitly vs keep feature. | Leave dropped. | Knowingly shipped data loss. | Yes — tied to #1. |

**Minimal list:** only #1/#2 truly block first PR. Remainder can proceed behind feature flags with recommendation as default.
