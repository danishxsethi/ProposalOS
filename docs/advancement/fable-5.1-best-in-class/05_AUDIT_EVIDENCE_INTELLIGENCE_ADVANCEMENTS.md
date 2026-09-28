# 05 — Audit, Evidence, and Intelligence Advancements — Fable 5.1 Best-in-Class

## Current state (re-checked)

- `lib/audit/runner.ts:960 MODULE_REGISTRY` 27 modules, 3 phases `executePhase` worker-pool 6, typed `ModuleInput/ModuleResult` via `lib/modules/types.ts`, `withTimeout` 10–60s + AbortSignal, wall 5m, `adaptAuditModuleResult/adaptLegacyModuleResult` at edge, `deduplicateFindings` by fingerprint, `assessAuditResult trustState`, `findingPersistence.ts:101` sole writer + `validateSnapshotPayload` secret-key screen.
- Providers: Places via `lib/maps/googleMapsProvider.ts: mapsIntelligence`, PageSpeed via PSI, SerpAPI via `competitor/keywordGap/paidSearch/videoPresence`, Gemini via `lib/llm/provider.ts`, Puppeteer `axe-core` chromium, crawling via `websiteCrawler.ts` single-flight 20 pages.
- Costs: `CostTracker:174` per-module `addApiCall/addLlmCall` + `apiCostCents`, tier budgets `FREE 500/50` etc., cap 200¢, `redisSpendTracker checkAndAddSpend` + `withAuditBudget` reservation 10m TTL.
- Evidence: `EvidenceSnapshot targetUrl+providerRequestId+methodVersion+observationStatus` + `Finding.evidence[]` pointer collected_at source type value — provenance exists but is implicit.

## What is good (keep)

The runner contract + trustState + cost reserve→settle is correct. Do not rewrite orchestration.

## Advancements

### 1. Separate collectors from analyzers (ADV-AUDIT-01 — T1, biggest leverage)

**Current deficiency:** `website`, `techStack`, `security`, `schemaMarkup`, `contentQuality`, `conversion`, `privacyCompliance`, `mobileUX`, `seoDeep` all `safeFetch` the same origin html individually. `gbp` and `gbpDeep` both call Places for same `placeId`. `competitor` and `keywordGap` both call SerpAPI same query. Paying 2–3× latency/cost and deduping charitably after.
**Target:** 5 collectors run once per audit and emit typed `EvidenceBundle` entries that analyzers consume as pure functions:

```
Collectors (network): WebsiteCrawl (html+head+screenshots) | PlacesIdentity (resolveBusiness COMPLETE/PARTIAL) | SearchLandscape (SerpAPI local+rank) | RenderingSnapshot (axe/Puppeteer) | DnsTlsHeaders
Analyzers (pure):     techStack, security, schemaMarkup, contentQuality, conversion, privacy, seoDeep, reputation(cached reviews), etc.
Synthesis:            competitorStrategy, vision (image) over vault
```

**Design:** `ModuleConfig.kind: 'collector'|'analyzer'` + `ModuleIO<In,Out>` generic (ADV-AUDIT-02). `runner.ts:executePhase` runs collectors in phase 1 with cache key = `sha256(url|placeId|auditId)` scoped to audit; Evidence Vault is `Map<EvidenceKey, EvidenceSnapshot>` passed via `ModuleInput.evidenceVault`. Analyzers declare `requires: EvidenceKey[]` and become testable with fixture vaults — no network in unit tests. `src/__tests__/moduleVaultFixtures/*.json`.
**Why better:** cuts wall 30–50% and cost ~30% on fixtures, makes 27→5 network boundary + 22 analyzers trivially unit-tested, eliminates non-deterministic ordering beyond collector order.
**Proof:** p95 wall + `apiCostCents` per audit before/after on 5-industry golden set, plus `cache-hit label` per module.

### 2. Typed ModuleIO + strict contracts (ADV-AUDIT-02 — T1)

Replace `any` module data with `ModuleResult<TData, TEvidence extends EvidenceSnapshot>` per module + Zod at registry edge (not inside module logic). `lib/modules/types.ts` becomes `types/collectors.ts` + `types/analyzers.ts`. Legacy `LegacyAuditModuleResult` adapters migrate to `Map<legacyModuleId, ModuleIO>` until zero legacy paths remain (most are already migrated).

### 3. Phase manifest as data (ADV-AUDIT-03 — T1)

Move `getPhaseConcurrency()`, `FEATURE_FLAG_GATED_MODULES {accessibility:ENABLE_*,...}`, `dependsOn` from imperative checks to manifest `lib/audit/phasesManifest.ts`. The dashboard can render "Gated 2, Skipped 3 (deps), Dead 0" from same source dashboards+tests share.

### 4. Progressive publish (ADV-AUDIT-04 — T1)

Phase-1 findings (website+gbp+techStack) publish immediately via polling `/api/audit/batch/[batchId]/route.ts:GET` with `status: 'PARTIAL'` + stream; full trust→READY fires after phase 3. Same queue — just exposes `modulesCompleted[]` progressively. Agency sees value at 15s not 5m. Via existing `Audit.modulesCompleted/modulesFailed` arrays.

### 5. Evidence chain as product (ADV-DATA-02 — T1, differentiator)

**Current:** `Finding.evidence[] {pointer, collected_at, source, value}` exists; chain is implicit across module names.
**Target:** `ProposalEnvelopeV1 {collectors: EvidenceBundle[], findings: FindingView[], claims: GroundedClaim[] {text → findingIds → evidenceIds → collectorMethodVersion}, commercial: {ruleId: 'proposal-pricing-v1', tierMapping, timeline, roiStatus} }` with `proposalPublicationFingerprint = SHA256(canonical(Envelope))`. Public proposal renders clickable traversal `claim → Finding card → Evidence drawer (pointer+method+timestamp+providerRequestId)` for any suspicious claim. That is the trust moat.
**Why:** Competitors show scores; we show chain. Every numeric `$?%` passes `validateCustomerClaim` numeric/substantive overlap + source binding; chain is UI, not ceremony.
**Proof:** published proposal click task: random claim's evidence viewer shows `source: 'places_api_v1'` with 2026 timestamp and `targetUrl` matching businessUrl.

### 6. Caching & reuse as system (ADV-PERF-01/03 — T1/T2)

Promote existing single-flight in `websiteCrawlerModule.ts` to shared per-audit `fetchCache: Map<url, {html, headers, fetchedAt}>` injected via `ModuleContext`. PageSpeed cached 12h at `PROXY/Cache` layer, Places identity deduped by `MapsIdentityCache` (tenant+placeId). `COST_TRACKED` label per module on `ModuleResult.cost`.

### 7. Module test harness (T2)

Per-module golden fixtures `tests/fixtures/modules/{gbp,seoDeep,competitor}/*.json` driving analyzers without network/LLM; contract tests assert `Finding.evidence.length≥1` + `impactScore 0-10` + `costBilled` label.

**What not to add:** another orchestration layer, another evidence table. JSONB + Envelope hash is enough at RC scale; vault table only when raw HTML >10GB/tenant.
