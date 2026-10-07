# 08 — Billing and Money Proof — Fable 5.1 Full Advancement

**Catalog:** PlanCatalogService 99/299/599 canonical (documented), PricingService kept but not RFQ.

**Checkout idempotency:** proposal-checkout via acceptance commercialFingerprint SHA256 already; saas checkout now period-scoped idempotencyKey + Stripe Idempotency-Key deduplication.

**Quota lock:** pg_advisory_xact_lock(hashtext tenantId) in fallback admission prevents 99/100→101 TOCTOU.

**Webhooks:** single canonical /api/stripe/webhook with ProcessedWebhookEvent PK dedup; billing/webhook is re-export alias (soft-deprecate).

**Live Stripe smoke:** not run — requires sk_test. Test harness complete, artifact pending external block.
