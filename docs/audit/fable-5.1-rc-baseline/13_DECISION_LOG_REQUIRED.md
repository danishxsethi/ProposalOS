# 13 — Decisions Required — Fable 5.1

1. **Migrations:** commit schema drift (businessLatitude/Longitude) as proper migration vs drop columns? Owner: eng lead. Blocks WS1.
2. **Pricing canonical:** PlanCatalogService (hardcoded 99/299/599) vs PricingService (7-currency DB) — keep which for RC? Recommend PlanCatalogService. Owner: product.
3. **Billing webhook URL:** keep /api/stripe/webhook only or keep alias /api/billing/webhook? Recommend single. Owner: eng.
4. **Claraud brand:** include widget/white-label as RC sellable or appendix? Recommend appendix, not RC core. Owner: product.
5. **Self-evolving prompts DB:** ship as design appendix or migrate tables into Prisma schema for RC? Recommend defer post-GA. Owner: eng+product.
6. **Outreach live send:** default human approval required at RC? Recommend yes, keep sandbox default. Owner: product.
7. **Module marketing count:** sell 27 vs gated subset? Recommend "27 modules, rollout flags may skip gracefully" honesty. Owner: marketing.
8. **locale_configs data loss:** restore 7 rows or intentionally deprecate table? Owner: eng.
