# Sprint 1 Status — The Engine (Feb 15 – Mar 15)

*Theme: "Make it work flawlessly. Zero bugs. Agency-grade output."*

**Last updated:** Feb 2026

---

## Goal Checklist

| Goal | Status | Notes |
|------|--------|------|
| **Bug-zero engine** | ✅ Done | Full audit → diagnosis → proposal → PDF pipeline runs end-to-end. 0 critical/high bugs (SPRINT1_AUDIT). |
| **Agency-grade output** | ✅ Infrastructure | QA auto-READY at ≥90%. 13 automated checks. Proposals need ongoing prompt tuning to hit 90% consistently. |
| **Production deployment** | ✅ Done | Live on GCP Cloud Run. `deploy.sh`, `cloudbuild.yaml`. Custom domain optional (run.app has HTTPS). |
| **Vertical depth** | ✅ Done | 10 vertical playbooks tuned for Saskatoon: dentist, law-firm, hvac, restaurant, real-estate, gym, veterinary, salon, contractor, retail. |
| **50 real business audits** | 🟡 Ready | `npm run build-targets` → `npm run sync-targets-to-data` → `npm run batch-audit`. Or `npm run blitz` with build-targets output. |
| **Sales toolkit** | ✅ Done | One-pager, pricing card, objection handler (10), discovery script, launch checklist, pitch rehearsal. All print-ready. |

---

## How to Complete 50-Audit Blitz

### Option A: New batch-audit (data/saskatoon-targets.json)

```bash
# 1. Build targets from Google Places (requires GOOGLE_PLACES_API_KEY)
npm run build-targets

# 2. Sync to data format
npx tsx scripts/sync-targets-to-data.ts

# 3. Run batch audits (server must be running)
npm run batch-audit
```

### Option B: Original blitz (scripts/output)

```bash
npm run build-targets
npm run blitz
```

---

## Remaining Gaps (Minor)

1. **Custom domain** — Using default run.app URL. Add domain mapping when ready.
2. **Uptime monitoring** — Not configured. Consider Cloud Monitoring + alerting.
3. **QA consistency** — Proposals may score 70–85% on some audits. Prompt tuning and diagnosis upgrades can improve.

---

## Sales Toolkit Additions (This Sprint)

- **Case study template** — `GET /api/case-study/[auditId]/generate`, `CaseStudyTemplate` component
- **Follow-up email sequence** — 3 emails (Day 0, 3, 7), CAN-SPAM, `POST /api/email/send-followup`
- **Cold email generation** — `POST /api/email/generate`, 3 variants, quality scoring (0–100), regenerate if &lt;70
- All in `/sales-toolkit`, `/api/email/*`, `lib/email-templates/`
