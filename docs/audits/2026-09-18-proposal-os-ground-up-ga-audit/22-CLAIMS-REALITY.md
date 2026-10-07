# Claims-vs-Reality Ledger

| Claim | Source | Evidence | Status | Safe wording |
| --- | --- | --- | --- | --- |
| “Business name + city -> 90-second audit -> evidence-backed proposal” | README | Build/source only; no live latency/evidence trace | UNSUPPORTED as performance claim | “Source implements an audit/proposal pipeline; live latency and evidence quality require qualification.” |
| “Automated website, GBP, competitor analysis” | README/module registry | Source modules exist; providers/runtime not verified | PARTIALLY_CORRECT | “Implemented provider adapters, subject to provider configuration and degraded states.” |
| “Evidence-based findings” | README/contracts | Finding contract exists; snapshots nonfatal and some findings rejected | PARTIALLY_CORRECT | “Findings require structured evidence in the canonical path, with known module limitations.” |
| “Professional PDFs” | README/PDF route | Generator exists; deployed origin/rendering not verified | NOT_EVIDENCED | “PDF generation is implemented and requires hosted smoke qualification.” |
| “Automated follow-up” | README/email/cron | Multiple code paths; mock-send and integration state unclear | PARTIALLY_IMPLEMENTED | “Follow-up code exists; delivery is operator/sandbox controlled until verified.” |
| “Autonomous agency” | historical/docs/product vision | Fulfillment executor unavailable; full runtime trace absent | ASPIRATIONAL | “Proposal automation platform with future autonomous-agency expansion.” |
| “Temporal complete” | historical claims | No Temporal dependency/source worker; graph says deferred | CONTRADICTED | “Database-backed queue and LangGraph are present; Temporal is not current.” |
| “Multi-tenant / white-label” | schema/UI/docs | Tenant fields/RLS source; critical auth/header gaps and no live proof | NOT_EVIDENCED | “Tenant-aware source architecture; isolation qualification pending.” |
| “Self-improving” | learning/prompt code | Learning source exists; placeholders/global scope/auto-promotion safety unproven | ASPIRATIONAL | “Outcome and prompt-learning components exist but are not a verified autonomous loop.” |
| “Production ready / GA” | historical reports | Current lint/test/live provenance/security gates fail or blocked | CONTRADICTED | “Not GA-qualified at frozen release.” |
