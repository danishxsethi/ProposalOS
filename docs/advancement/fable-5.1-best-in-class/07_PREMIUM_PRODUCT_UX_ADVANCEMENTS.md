# 07 — Premium Product UX Advancements — Fable 5.1 Best-in-Class

## Current status

UNVERIFIED on baseline HEAD — no screenshot matrix, no axe report, no keyboard/contrast/zoom pass. Inventory in `07_PREMIUM_UX_PRODUCT_AUDIT.md` listed surfaces but did not measure them. This doc designs the target so a designer+eng can build.

## Principles (borrowed, not copied)

- **Linear:** interaction is instant, status language is one word, density is information not chrome.
- **Stripe:** price=truth, test vs live impossible to confuse, progress never lies.
- **Vercel:** deploy/progress feedback is continuous, not a spinner at 5m.
- **Notion:** composed docs feel edited, not templated.

## Canonical agency workflow (the only IA that earns "premium")

```
Marketing → Login (Google + Credentials) → Workspace setup (branding, domain verify CNAME, widget allowlist, sender identity) → First audit (URL+city, QUICK vs FULL) → Progress (phase 1 stream) → Results (score + Findings grouped by PAINKILLER/VITAMIN with evidence drawer) → Evidence (traversal chain) → Diagnosis (≤5 root pains ranked) → Proposal generate → Edit/Approve (human-review queue explicit) → Share (public token + PDF parity) → Prospect view (tracked) → Acceptance+checkout/schedule → Batch (≤25) → Prospecting (discovery→enrich→qualify sandbox) → Recurring re-audit
```

Current `app/(dashboard)/settings/*` spreads this across 10 settings pages; `app/(admin)` is discoverable by any login; `sales-toolkit` is separate from dashboard workflow.

## Advancements per surface

| Surface | User goal | Ideal experience | Current gap | Advancement |
|---|---|---|---|---|
| Marketing | Trust in 10s | One promise: "evidence-backed proposals that close" + 3 evidence chains + 1 sample PDF | Multiple stories (ProposalOS vs Claraud) | Unify brand story, add sample PDF with chain |
| Signup/login | Fast secure entry | Google primary + Credentials fallback, brute-force feedback, 1h session understood | `PASSWORD_POLICY` not surfaced | Surface policy inline + forgot flow |
| Onboarding/workspace | Be agency-branded in 2 min | Brand→domain CNAME verify green → widget allowlist → sender SPF/DKIM status dots | Settings scattered | Single onboarding stepper with verify dots |
| Create audit | One field + one click | URL+city, picks QUICK(2)|FULL(27) with shared crawl note, quota remaining inline | No mode explanation | Mode toggle + cost/time estimate |
| Progress | No anxiety wait | Phase-1 findings stream at 15s, phases labeled, cost ticking, abort/pause | 5m wall blank | Streaming progress + abort (ADV-AUDIT-04) |
| Results | Decide what hurts | Score + grouped findings (Pill: PAINKILLER red, VITAMIN) + impact 0-10 + effort LOW/MED | Wall of cards | Density + grouping + dedup provenance |
| Evidence drawer | Verify any claim | Click claim → Finding → Evidence {pointer, source `places_api_v1`, collected_at 2026-09-28, providerRequestId, methodVersion} in drawer | Drawer missing | Evidence Vault viewer (ADV-DATA-02) |
| Diagnosis | See root causes | ≤5 clusters ranked, each cites findingIds exactly (no hallucinated citations) | Clusters long | Rank + cite fidelity (diagnosis graph) |
| Proposal editor | Safe to send | Tiers (Essentials/Growth/Premium) with deterministic prices + comparison, assumptions/disclaimers/nextSteps≥1, QA badge | Price source unclear | Expose ruleId `proposal-pricing-v1` + QA badge |
| Approval | Never send hallucination | Gate: `APPROVED+PUBLISHABLE+fingerprint` green vs `REVIEW_REQUIRED` queue | Implicit | Explicit human-review queue (ADV-AI) |
| Public proposal | CEO-suitable read | Personalized exec summary (businessName+city+competitor), prioritized issues, tier compare table, evidence chain link, CTA hire urgency not greed | Template feel | Brand-parity + chain + ROI range (ADV-UX-03) |
| Payment | One click trust | Accepted price === Stripe retrieve else 409 + reconciliation note, SAAS trial 14d honest | 409 text diverges snapshot | Unify error copy |
| PDF | Off-brand proof | PDF === web (spacing/type) generated via Chromium same tokens | PDF divergence risk | Token parity + side-by-side artifact |
| Batch | Scale without chaos | ≤25 with quota + idempotencyKey + partial failure isolation + export | Quota TOCTOU | Lock + stream |
| Outreach/prospecting | Find without blast | Discovery dedup, qualify pain≥60, enrichment waterfall status, sequence quality 90, sandbox vs live toggle with caps preview | 3 worker names confuse | Growth plane diagram + one toggle |
| Billing/settings | Never surprised | Meter vs catalog parity, overage billed honest, trial/grace banner | Meter drift | Single catalog (ADV-BILL-02) |
| Error states | Trust when broken | providerAvailable=>reason code not generic 500; degraded banner explain | Generic | Degraded taxonomy |
| Empty states | First use delight | Zero-audit empty with sample audit CTA | Bare | Illustration + CTA |
| Mobile 320→1440 | Executive on phone | Comparison table responsive, CTA sticky | template | Responsive table pattern |

## Design-system refinement (not one-off page polish)

`components/ui/*` tokens: spacing 4/8/12/16/24, type scale, radius 8/12/16, shadow low/medium, color with contrast ≥4.5:1, reduced-motion. Extract from `app/globals.css`+`tailwind.config` + new `lib/config/design-tokens.ts` generation so PDF and web share.

## Acceptance (prevents "looks good")

- Screenshot matrix `evidence/screenshots/{320,375,768,1024,1440}/*` per primary journey.
- `axe-core` `0 critical/serious` on audit→proposal→public→checkout.
- Keyboard-only path audit→accept without trap.
- Contrast report, 200% zoom, empty+extreme (long name+no GBP).
