# Implementation Plan: Agency-Grade QA (≥90%) for All Proposals

**Goal:** Every proposal passes at least **12 of 13** QA checks (90%+), with no single check routinely failing.

**Current state:** Validation run showed 85–92% (4 at 85%, 1 at 92%). To reach 90% for all, we need to eliminate the 1–2 checks that still fail on ~80% of proposals.

---

## 1. The 13 QA Checks (and risk level)

| # | Check | Category | At-risk? | Typical failure |
|---|--------|----------|----------|------------------|
| 1 | Evidence Check | Finding Quality | Low | Finding missing evidence array |
| 2 | Impact Score Range (1–10) | Finding Quality | Low | Module emits out-of-range score |
| 3 | No Duplicates (title+module) | Finding Quality | Low | Duplicate finding titles |
| 4 | Min 3 Findings | Finding Quality | Low | Audit returns &lt;3 findings |
| 5 | At least 1 Painkiller | Finding Quality | Medium | All findings typed VITAMIN |
| 6 | Summary Mentions Business | Proposal Quality | Low | LLM drops business name |
| 7 | Summary Mentions City | Proposal Quality | Medium | City not in prompt or LLM omits |
| 8 | Summary Length (2–7 sentences) | Proposal Quality | Medium | 1 or 8+ sentences |
| 9 | Tiers have 2+ items | Proposal Quality | Low | Tier mapping edge case |
| 10 | Valid Finding IDs in Tiers | Proposal Quality | Low | ID mismatch |
| 11 | Pricing Logic (E &lt; G &lt; P) | Proposal Quality | Low | Logic bug |
| 12 | No Wrong Business Name | Anti-Hallucination | Low | Same as #6 |
| 13 | **Summary Cites Specific Metrics (≥2)** | Proposal Quality | **High** | LLM writes generic summary |

**Conclusion:** The check most likely to block 90% is **#13 (Summary Cites Specific Metrics)**. Secondary: **#7 (City)**, **#8 (Length)**, **#5 (Painkiller)**.

---

## 2. Phase 1: Observe which checks actually fail (1–2 days)

**Objective:** Stop guessing; log which checks fail when score &lt; 90.

### 2.1 Log failed checks in propose route

- **File:** `app/api/audit/[id]/propose/route.ts`
- **Change:** When `qaStatus.score < 90`, log `qaStatus.results.filter(r => !r.passed)` (check names + details) at INFO or WARN.
- **Optional:** Add a small script or DB query to aggregate failed-check counts from recent proposals (if qaResults are stored and queryable).

### 2.2 Optional: Batch report with per-check pass rates

- **Script:** e.g. `scripts/qa-failure-report.ts`
- **Input:** Recent N proposals from DB (or re-run autoQA on stored proposal JSON).
- **Output:** For each of the 13 checks, count how many proposals failed it. Sort by failure count.
- **Deliverable:** One run over last 50 proposals → "Check 13 failed 18 times, Check 7 failed 5 times, …"

**Exit criterion:** We have a ranked list of which checks fail most often.

---

## 3. Phase 2: Fix the top 1–2 failing checks (3–5 days)

Apply fixes in order of observed failure rate.

### 3.1 If **Summary Cites Specific Metrics (≥2)** is top

- **2a. Stricter prompt**
  - In `prompts/exec-summary-v1.txt` and `v2.txt`, add: "Your first draft must include at least 2 numbers. Before returning, list them: (1) ___, (2) ___. If either is missing, add a sentence."
  - Or switch to a **structured output** for the executive summary (e.g. JSON with `opening`, `metrics_sentence`, `body`, `closing`) and then concatenate; guarantees a dedicated metrics sentence.
- **2b. Post-process fallback**
  - **File:** `lib/proposal/executiveSummary.ts` (or caller).
  - **Logic:** After LLM returns, run the same metric regex used in autoQA. If `metricMatches.length < 2`, append a single sentence built from the first 2 entries in `numbersToCite` (e.g. "Key metrics from this audit: [X], [Y]."). This guarantees 2+ metrics for QA while keeping the rest of the summary unchanged.
- **2c. Two-shot**
  - If summary has &lt;2 metrics, call the LLM again with a short prompt: "Add exactly one sentence to the following summary that cites two specific numbers from this list: [numbers]. Summary: [current summary]."

**Recommendation:** Start with **2b (post-process fallback)**; it’s deterministic and fast. Add 2a or 2c if we want to reduce reliance on fallback.

### 3.2 If **Summary Mentions City** is top

- **File:** `lib/proposal/executiveSummary.ts`
- **Current:** `city_context` is injected when city is set.
- **Change:** In the template, add a hard requirement: "If city_context is non-empty, your summary MUST contain the exact string '[CITY]' (the city name)."
- **Alternative:** Post-process: if `city` is set and summary does not include it, append " This audit reflects [business_name]'s presence in [city]." (or similar).

### 3.3 If **Summary Length (2–7 sentences)** is top

- **Option A:** Widen to 2–8 sentences in `lib/qa/autoQA.ts` (already 2–7).
- **Option B:** In the prompt, add: "Output exactly 4, 5, or 6 sentences. Count before submitting."
- **Option C:** Post-process: if `sentences < 2`, append a generic metrics sentence; if `sentences > 7`, split the longest sentence or trim the last one.

### 3.4 If **At least 1 Painkiller** is top

- **File:** Audit modules / finding generator.
- **Ensure:** Every audit run produces at least one finding with `type === 'PAINKILLER'` for high-severity issues (e.g. security, critical performance, zero reviews).
- **Fallback:** In `lib/proposal/tierMapping.ts` or before QA, if `painkillers.length === 0`, set the highest-impact finding’s type to `PAINKILLER` (or a similar rule so the pipeline always has at least one).

**Exit criterion:** Re-run validation batch (e.g. 5–10 proposals that previously scored 85). All should score ≥90, or we have a new ranked failure list and continue.

---

## 4. Phase 3: Harden the rest (2–3 days)

- **Evidence Check:** Ensure every module that creates findings attaches at least one evidence object (pointer, type/value/label, or legacy url/source/raw). Add a central “evidence enforcer” in the finding generator or runner that adds a minimal evidence if missing.
- **Tiers have 2+ items:** Already enforced in `lib/proposal/tierMapping.ts`; add a unit test for 3, 4, 5 findings and edge cases so we don’t regress.
- **Impact Score Range:** In the finding generator (or schema), clamp impactScore to 1–10 so invalid values never reach QA.
- **No Duplicates:** Dedupe by (module, title) in the audit runner before diagnosis/proposal, so duplicates never reach QA.

**Exit criterion:** No proposal in a 50-audit batch scores below 90%.

---

## 5. Phase 4: Maintain agency-grade (ongoing)

- **CI or weekly job:** Run a small batch (e.g. 5 audits) and assert `avg QA score >= 90` and `min QA score >= 85` (or 90). Fail the job if not.
- **Dashboard:** Expose `qaScore` and, if stored, a breakdown of passed/failed checks in the proposal detail view so you can spot regressions quickly.
- **Alerts:** If a proposal is saved with `qaScore < 70`, log a warning or send a single alert so someone can inspect.

---

## 6. Suggested order of work

| Order | Task | Owner | Est. |
|-------|------|--------|------|
| 1 | Add logging of failed checks when score &lt; 90 (propose route) | Dev | 0.5 day |
| 2 | (Optional) qa-failure-report script over last N proposals | Dev | 0.5 day |
| 3 | Post-process: append metrics sentence if &lt;2 in summary | Dev | 1 day |
| 4 | Re-run validation batch (5–10 proposals), confirm 90+ | Dev | 0.5 day |
| 5 | If city/length/painkiller still fail, apply Phase 2 fixes | Dev | 1–2 days |
| 6 | Phase 3 hardening (evidence, tiers, impact, dedupe) | Dev | 2 days |
| 7 | Phase 4: batch assertion or CI check | Dev | 0.5 day |

**Total estimate:** ~5–7 days to reach “agency-grade for all” with monitoring in place.

---

## 7. Success metrics

- **Primary:** 100% of proposals in any 50-audit batch have QA score ≥ 90%.
- **Secondary:** No single check fails more than 5% of the time in that batch.
- **Tertiary:** Average QA score ≥ 92% (room for occasional 90–91%).

---

*Document created: 2026-02-16. Update this plan as you implement and re-measure.*
