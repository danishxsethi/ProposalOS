# 02 — Decisions and Deviations — Fable 5.1 Full Advancement

**Advancement design was hypothesis, not commandment. Deviations logged here are wins when they match reality better.**

| # | Advancement proposal | Decision in execution | Why deviated | Trigger |
|---|---|---|---|---|
| 1 | `ADV-SEC-01 FIX billing/webhook alias delete` | Kept alias as `re-export` but documented canonical is /api/stripe/webhook` | Alias is used in docs/ scripts; hard delete would break backward compat links with single PR risk — soft deprecate instead | 1 line re-export harmless, duplicate dedup handles it |
| 2 | `ADV-BILL-02 defer PricingService` | Kept but not removed, documented as non-canonical | Grepping showed only app/api/pricing/plans uses it; deleting file would break that route with no demand signal yet | T4 |
| 3 | `ADV-DOC-01 generate env` | Kept .env.example hand-edited 10k lines, not generated | Generation script would be new build step with low leverage vs migration/test fixes at T0 | T2 defer |
| 4 | `lib/maps/googleMapsProvider.ts` SSRF fix | Added to allowlist + documented fixed hosts, not converted to safeFetch | Provider already validates via Google fixed hosts; safeFetch conversion would be second pass T2 | allowlist is correct boundary |

No replacement of AuditJob with Temporal / Kafka / microservices — boring validated as best-in-class at this scale.
