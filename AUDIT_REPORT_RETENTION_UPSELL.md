# Client Retention & Upsell Pipeline Audit Report

**Audit Date:** 3/15/2026  
**Auditor:** Proposal Engine OS Engineering  
**Scope:** Post-sale client lifecycle, retention mechanisms, upsell pipeline

---

## Executive Summary

This audit examined the client retention and upsell pipeline across 5 key areas. The system has foundational retention infrastructure but lacks client-facing visibility and automated re-engagement flows.

**Overall Assessment:** 🟡 Moderate gaps with critical P0 items requiring immediate attention

---

## 1. RECURRING SCANS & REPORTS

### 🔴 P0 - Critical Gaps

| Finding                                                   | Severity | File Reference                                    |
| --------------------------------------------------------- | -------- | ------------------------------------------------- |
| No automated follow-up scans after initial engagement     | 🔴 P0    | `lib/retention/scheduled-audit-runner.ts:1-250`   |
| Comparison reports generated but not delivered to clients | 🔴 P0    | `lib/retention/scheduled-audit-runner.ts:105-175` |
| No improvement report visualization for clients           | 🔴 P0    | Missing                                           |

### 🟠 P1 - High Priority

| Finding                                           | Severity | File Reference                                    |
| ------------------------------------------------- | -------- | ------------------------------------------------- |
| Delta tracking exists but lacks client visibility | 🟠 P1    | `lib/retention/scheduled-audit-runner.ts:105-150` |
| Frequency options limited to predefined intervals | 🟠 P1    | `prisma/schema.prisma:204-220`                    |

### 🟢 Working

| Feature                                                       | Status | File Reference                                    |
| ------------------------------------------------------------- | ------ | ------------------------------------------------- |
| AuditSchedule model supports recurring audits                 | ✅     | `prisma/schema.prisma:204-220`                    |
| Weekly/biweekly/monthly/quarterly frequencies                 | ✅     | `lib/retention/scheduled-audit-runner.ts:235-250` |
| Comparison report generation (score delta, resolved findings) | ✅     | `lib/retention/scheduled-audit-runner.ts:105-175` |
| Retention graph orchestrates scheduled audits                 | ✅     | `lib/graph/retention-graph.ts:1-175`              |

---

## 2. CLIENT DASHBOARD

### 🔴 P0 - Critical Gaps

| Finding                                   | Severity | File Reference                                            |
| ----------------------------------------- | -------- | --------------------------------------------------------- |
| No dedicated client-facing dashboard      | 🔴 P0    | `app/(dashboard)/dashboard/page.tsx:1-50` (operator-only) |
| No health score visualization for clients | 🔴 P0    | Missing                                                   |
| No on-demand scan capability for clients  | 🔴 P0    | Missing                                                   |
| No historical trend visualization         | 🔴 P0    | Missing                                                   |

### 🟡 P2 - Medium Priority

| Finding                                               | Severity | File Reference                 |
| ----------------------------------------------------- | -------- | ------------------------------ |
| FindingStatus model exists but not exposed to clients | 🟡 P2    | `prisma/schema.prisma:625-640` |
| ReviewSnapshot tracks history but no client access    | 🟡 P2    | `prisma/schema.prisma:655-663` |

### 🟢 Working

| Feature                                                  | Status | File Reference                       |
| -------------------------------------------------------- | ------ | ------------------------------------ |
| Operator dashboard exists                                | ✅     | `app/(dashboard)/dashboard/page.tsx` |
| FindingStatus tracking (not_started, in_progress, fixed) | ✅     | `prisma/schema.prisma:625-640`       |
| Overall score tracking on Audit model                    | ✅     | `prisma/schema.prisma:17-40`         |

---

## 3. UPSELL TRIGGERS

### 🟠 P1 - High Priority

| Finding                                             | Severity | File Reference                         |
| --------------------------------------------------- | -------- | -------------------------------------- |
| Upsell proposals created but conversion not tracked | 🟠 P1    | `lib/retention/upsellTrigger.ts:60-85` |
| No upsell analytics dashboard                       | 🟠 P1    | Missing                                |
| No dedicated upsell measurement                     | 🟠 P1    | Missing                                |

### 🟡 P2 - Medium Priority

| Finding                                                       | Severity | File Reference                         |
| ------------------------------------------------------------- | -------- | -------------------------------------- |
| Upsell outreach automated but not differentiated from initial | 🟡 P2    | `lib/retention/upsellTrigger.ts:60-85` |

### 🟢 Working

| Feature                                            | Status | File Reference                              |
| -------------------------------------------------- | ------ | ------------------------------------------- |
| Competitor-based upsell triggers (≥20 review gain) | ✅     | `lib/retention/upsellTrigger.ts:25-55`      |
| Website change detection triggers upsell           | ✅     | `lib/retention/upsellTrigger.ts:45-55`      |
| Automated upsell proposal creation                 | ✅     | `lib/retention/upsellTrigger.ts:60-85`      |
| Competitor monitoring system                       | ✅     | `lib/retention/competitor-monitor.ts:1-180` |
| DetectedSignal model for signal tracking           | ✅     | `prisma/schema.prisma:530-550`              |

---

## 4. NOTIFICATIONS & ENGAGEMENT

### 🔴 P0 - Critical Gaps

| Finding                                         | Severity | File Reference |
| ----------------------------------------------- | -------- | -------------- |
| No re-engagement campaigns for inactive clients | 🔴 P0    | Missing        |
| No notification frequency controls              | 🔴 P0    | Missing        |
| No activity-based personalization               | 🔴 P0    | Missing        |

### 🟠 P1 - High Priority

| Finding                                        | Severity | File Reference                            |
| ---------------------------------------------- | -------- | ----------------------------------------- |
| Limited notification types (no SMS, in-app)    | 🟠 P1    | `lib/notifications/email.ts:1-200`        |
| No opt-out mechanism beyond global unsubscribe | 🟠 P1    | `app/api/email/unsubscribe/route.ts:1-60` |

### 🟢 Working

| Feature                                                | Status | File Reference                      |
| ------------------------------------------------------ | ------ | ----------------------------------- |
| Email notifications (proposal ready, viewed, interest) | ✅     | `lib/notifications/email.ts:44-160` |
| NPS survey automation (Day 30/90)                      | ✅     | `lib/retention/nps.ts:1-175`        |
| Detractor flagging for manual outreach                 | ✅     | `lib/retention/nps.ts:115-175`      |
| Resend-based email delivery                            | ✅     | `lib/notifications/email.ts:1-30`   |

---

## 5. CHURN PREVENTION

### 🔴 P0 - Critical Gaps

| Finding                                      | Severity | File Reference |
| -------------------------------------------- | -------- | -------------- |
| No data export functionality for offboarding | 🔴 P0    | Missing        |
| No win-back flow for churned clients         | 🔴 P0    | Missing        |
| No structured offboarding checklist          | 🔴 P0    | Missing        |

### 🟠 P1 - High Priority

| Finding                                         | Severity | File Reference                          |
| ----------------------------------------------- | -------- | --------------------------------------- |
| Cancellation handling exists but no exit survey | 🟠 P1    | `app/api/stripe/webhook/route.ts:1-200` |

### 🟢 Working

| Feature                              | Status | File Reference                                    |
| ------------------------------------ | ------ | ------------------------------------------------- |
| Subscription status tracking         | ✅     | `prisma/schema.prisma:145-175`                    |
| Grace period system (7 days)         | ✅     | `app/api/cron/check-grace-periods/route.ts:1-105` |
| Auto-suspension after grace period   | ✅     | `app/api/cron/check-grace-periods/route.ts:35-60` |
| NPS detractor flagging               | ✅     | `lib/retention/nps.ts:115-175`                    |
| Stripe webhook cancellation handling | ✅     | `app/api/stripe/webhook/route.ts:85-120`          |

---

## Summary by Priority

### 🔴 P0 - Critical (4 items)

1. **No client-facing dashboard** - Clients cannot view health scores or progress
2. **No data export/offboarding** - Churned clients cannot export their data
3. **No re-engagement campaigns** - Inactive clients not detected or re-engaged
4. **No win-back flow** - Churned clients have no structured return path

### 🟠 P1 - High Priority (4 items)

1. **No upsell analytics** - Upsell conversion not tracked or measured
2. **No notification preferences** - Users cannot control notification frequency
3. **No improvement report delivery** - Comparison reports not client-accessible
4. **No on-demand scans for clients** - Clients cannot self-serve audits

### 🟡 P2 - Medium Priority (3 items)

1. **Limited personalization** - Notifications not activity-based
2. **No dedicated upsell dashboard** - Operators lack upsell pipeline visibility
3. **NPS model inconsistency** - Two implementations (`nps.ts` vs `nps-survey.ts`)

### 🟢 OK - Working Well (12 items)

1. Scheduled audit system with multiple frequencies
2. Competitor-based upsell triggers functional
3. NPS survey automation (Day 30/90)
4. Grace period suspension system
5. Detractor flagging for manual outreach
6. Email notification infrastructure
7. FindingStatus tracking
8. ReviewSnapshot historical data
9. Retention graph orchestration
10. Subscription status tracking
11. Stripe cancellation handling
12. DetectedSignal model for competitor changes

---

## Recommended Implementation Priority

### Phase 1 (Immediate - Week 1-2)

1. Build client-facing dashboard with health score
2. Implement data export functionality
3. Create re-engagement email campaigns
4. Build win-back flow for churned clients

### Phase 2 (Short-term - Week 3-4)

1. Add upsell analytics dashboard
2. Implement notification preferences
3. Create improvement report delivery
4. Enable client on-demand scans

### Phase 3 (Medium-term - Week 5-6)

1. Activity-based notification personalization
2. Operator upsell pipeline dashboard
3. NPS model consolidation

---

## Files Requiring Changes

| File                              | Action                  | Priority |
| --------------------------------- | ----------------------- | -------- |
| `prisma/schema.prisma`            | Add retention models    | P0       |
| `app/(client)/`                   | Create client portal    | P0       |
| `lib/client/`                     | Create client utilities | P0       |
| `lib/retention/re-engagement.ts`  | Create re-engagement    | P0       |
| `lib/retention/win-back.ts`       | Create win-back         | P0       |
| `lib/client/data-export.ts`       | Create export system    | P0       |
| `app/api/cron/retention/route.ts` | Create retention cron   | P1       |

---

**Audit Complete.** Implementation plan ready for execution.
