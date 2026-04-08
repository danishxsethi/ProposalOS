# Checkout and Onboarding Flow Audit Report

**Audit Date:** March 15, 2026  
**Auditor:** Cline AI Assistant  
**Scope:** Prospect → Paying Customer Conversion Flow

---

## Executive Summary

The Proposal Engine OS checkout and onboarding flow has been audited across five key areas. The system demonstrates solid fundamentals with Stripe integration, webhook handling, and onboarding UX. However, several critical issues were identified that require immediate attention.

**Overall Assessment:** 🟡 P2 - Functional with improvements needed

---

## 1. PRICING & PLAN SELECTION

### Findings:

| Finding                                                       | Classification | File Reference                             |
| ------------------------------------------------------------- | -------------- | ------------------------------------------ |
| Pricing tiers defined in code (hardcoded)                     | 🟡 P2          | `lib/stripe/stripe.ts:44-72`               |
| SaaS plans use environment variables for Stripe Price IDs     | 🟢 OK          | `lib/stripe/stripe.ts:50-69`               |
| Proposal plans use environment variables for Stripe Price IDs | 🟢 OK          | `lib/stripe/stripe.ts:74-78`               |
| No database-driven pricing (cannot update without redeploy)   | 🟡 P2          | `lib/stripe/stripe.ts`                     |
| No free trials configured in code                             | 🟡 P2          | N/A                                        |
| Coupons supported via Stripe Checkout but not exposed in UI   | 🟡 P2          | `app/api/stripe/checkout-saas/route.ts:38` |
| Recommended plan logic exists but is basic                    | 🟡 P2          | `lib/stripe/pricingService.ts:174-188`     |

### Details:

**Hardcoded Pricing (🟡 P2)**

- SaaS plans (Starter $99, Pro $299, Agency $599) are hardcoded in `lib/stripe/stripe.ts`
- Proposal plans (Essentials, Growth, Premium) use hardcoded Price IDs from environment
- **Risk:** Requires code deployment to change pricing
- **Recommendation:** Move to database-driven pricing (implemented in `lib/stripe/pricingService.ts`)

**Free Trials & Coupons (🟡 P2)**

- SaaS checkout includes 14-day trial period: `app/api/stripe/checkout-saas/route.ts:38`
- `allow_promotion_codes: true` is set but no UI for coupon entry
- **Recommendation:** Add coupon code input to checkout UI

**Recommended Plan Logic (🟡 P2)**

- Basic recommendation based on tier count and feature count
- Does not use diagnosis data for recommendations
- **Recommendation:** Implement diagnosis-based recommendations

---

## 2. CHECKOUT FLOW

### Findings:

| Finding                                | Classification | File Reference                                    |
| -------------------------------------- | -------------- | ------------------------------------------------- |
| Uses Stripe Checkout Sessions (secure) | 🟢 OK          | `app/api/stripe/checkout-proposal/route.ts:47-62` |
| Uses Stripe Checkout Sessions for SaaS | 🟢 OK          | `app/api/stripe/checkout-saas/route.ts:28-44`     |
| HTTPS enforced via Stripe (redirect)   | 🟢 OK          | Stripe-managed                                    |
| No sensitive data in URL params        | 🟢 OK          | `app/api/stripe/checkout-proposal/route.ts:53-55` |
| Card declines handled by Stripe        | 🟢 OK          | Stripe-managed                                    |
| 3D Secure handled by Stripe            | 🟢 OK          | Stripe-managed                                    |
| Success redirect includes session_id   | 🟢 OK          | `app/api/stripe/checkout-proposal/route.ts:53`    |
| Cancel redirect returns to proposal    | 🟢 OK          | `app/api/stripe/checkout-proposal/route.ts:54`    |
| Cart abandonment tracking implemented  | 🟢 OK          | `lib/analytics/cartAbandonmentService.ts`         |
| Pricing validation before checkout     | 🟢 OK          | `app/api/stripe/checkout-proposal/route.ts:26-38` |

### Details:

**Security (🟢 OK)**

- Stripe Checkout Sessions redirect users to Stripe-hosted checkout
- No card data touches application servers
- Session IDs passed securely via URL parameters (Stripe-generated)

**Payment Validation (🟢 OK)**

- Proposal checkout validates pricing matches Stripe: `app/api/stripe/checkout-proposal/route.ts:26-38`
- 1% tolerance for pricing discrepancies
- Returns 409 Conflict if mismatch detected

**Cart Abandonment (🟢 OK)**

- Full tracking implementation in `lib/analytics/cartAbandonmentService.ts`
- Tracks: initiated, pricing_selected, checkout_started, payment_failed, completed
- Database table: `CartAbandonmentEvent`

---

## 3. WEBHOOK HANDLING

### Findings:

| Finding                               | Classification | File Reference                            |
| ------------------------------------- | -------------- | ----------------------------------------- |
| Webhook signature verification        | 🟢 OK          | `app/api/stripe/webhook/route.ts:75-80`   |
| Idempotency via ProcessedWebhookEvent | 🟢 OK          | `app/api/stripe/webhook/route.ts:82-85`   |
| Dead letter queue for failed webhooks | 🟢 OK          | `lib/stripe/webhookRetryService.ts`       |
| Handles checkout.session.completed    | 🟢 OK          | `app/api/stripe/webhook/route.ts:93-141`  |
| Handles customer.subscription.updated | 🟢 OK          | `app/api/stripe/webhook/route.ts:143-159` |
| Handles customer.subscription.deleted | 🟢 OK          | `app/api/stripe/webhook/route.ts:161-184` |
| Handles invoice.payment_failed        | 🟢 OK          | `app/api/stripe/webhook/route.ts:186-218` |
| Handles invoice.paid                  | 🟢 OK          | `app/api/stripe/webhook/route.ts:220-265` |
| Reconciliation logic exists           | 🟢 OK          | `lib/stripe/reconcile.ts`                 |
| Error handling with DLQ logging       | 🟢 OK          | `app/api/stripe/webhook/route.ts:267-281` |

### Details:

**Signature Verification (🟢 OK)**

```typescript
// app/api/stripe/webhook/route.ts:75-80
const signature = headerList.get('Stripe-Signature');
if (!signature) {
  return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
}
event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret());
```

**Idempotency (🟢 OK)**

- Uses `ProcessedWebhookEvent` model to track processed events
- Events with same ID are rejected: `app/api/stripe/webhook/route.ts:82-85`

**Dead Letter Queue (🟢 OK)**

- `FailedWebhookEvent` model stores failed webhook attempts
- Retry service with exponential backoff: `lib/stripe/webhookRetryService.ts`
- Max 5 attempts before manual intervention required
- Cron endpoint for automated retry: `app/api/cron/retry-webhooks/route.ts`

**Reconciliation (🟢 OK)**

- `lib/stripe/reconcile.ts` provides subscription sync
- Compares local data against Stripe API
- Identifies abandoned checkout attempts

---

## 4. ACCOUNT PROVISIONING

### Findings:

| Finding                                  | Classification | File Reference                            |
| ---------------------------------------- | -------------- | ----------------------------------------- |
| User account created during registration | 🟢 OK          | `app/(auth)/register/page.tsx`            |
| Tenant created automatically             | 🟢 OK          | Registration flow                         |
| Subscription linked to tenant            | 🟢 OK          | `app/api/stripe/webhook/route.ts:108-118` |
| Project created after proposal payment   | 🟢 OK          | `app/api/stripe/webhook/route.ts:113-121` |
| Delivery triggered automatically         | 🟢 OK          | `app/api/stripe/webhook/route.ts:267-277` |
| No grace period for failed renewals      | 🔴 P0          | N/A                                       |
| Subscription status tracked              | 🟢 OK          | `prisma/schema.prisma:Tenant`             |

### Details:

**Account Creation (🟢 OK)**

- User accounts created during registration flow
- Tenant automatically provisioned
- Linkage via `tenantId` foreign key

**Subscription Linking (🟢 OK)**

```typescript
// app/api/stripe/webhook/route.ts:108-118
await tx.subscription.upsert({
  where: { stripeSubscriptionId: subscription.id },
  create: {
    tenantId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: accessStatus,
    // ...
  },
  update: { ... }
});
```

**Grace Period (🔴 P0 - CRITICAL)**

- No grace period implemented for failed renewals
- `past_due` status set immediately on payment failure
- **Risk:** Customers lose access immediately
- **Recommendation:** Implement 7-14 day grace period before suspension

---

## 5. ONBOARDING

### Findings:

| Finding                                   | Classification | File Reference                              |
| ----------------------------------------- | -------------- | ------------------------------------------- |
| Onboarding page exists                    | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx`       |
| Different flows for proposal vs SaaS      | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx:33-47` |
| Guided setup with action buttons          | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx:68-82` |
| Progress tracking (onboardingCompletedAt) | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx:18-21` |
| Connect accounts step                     | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx:38`    |
| Customize branding step                   | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx:39`    |
| First audit/audit step                    | 🟢 OK          | `app/(dashboard)/onboarding/page.tsx:40`    |
| Delivery kickoff after proposal payment   | 🟢 OK          | `app/api/stripe/webhook/route.ts:267-277`   |
| Time-to-value: Immediate dashboard access | 🟢 OK          | N/A                                         |

### Details:

**Onboarding Flow (🟢 OK)**

- Proposal flow (3 steps):
  1. Welcome + payment confirmation
  2. Delivery status tracking
  3. Client dashboard access

- SaaS flow (5 steps):
  1. Welcome + plan confirmation
  2. Connect accounts (Google, social)
  3. Customize branding
  4. Run first audit
  5. Go live

**Guided Setup (🟢 OK)**

```typescript
// app/(dashboard)/onboarding/page.tsx:68-82
<Link href="/settings/integrations">Connect accounts</Link>
<Link href="/settings/branding">Customize branding</Link>
<Link href="/new-audit">Run first audit</Link>
```

**Time-to-Value (🟢 OK)**

- Immediate dashboard access after payment
- Proposal delivery kicks off automatically via webhook
- SaaS users can run audits immediately

---

## Summary by Priority

### 🔴 P0 (Critical)

| Issue                               | Impact                                               | Recommendation                                           | Status   |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | -------- |
| No grace period for failed renewals | Customers lose access immediately on payment failure | Implement 7-14 day grace period with email notifications | ✅ FIXED |

**Implementation Details:**

- Prisma schema updated with `gracePeriodEndsAt` and `gracePeriodNotifiedAt` fields
- Webhook handler updated to set 14-day grace period on `invoice.payment_failed`
- Cron job created at `/api/cron/check-grace-periods` to suspend expired grace periods
- Daily cron recommended for automated enforcement

### � P1 (High)

| Issue           | Impact | Recommendation |
| --------------- | ------ | -------------- |
| None identified | -      | -              |

### �🟡 P2 (Medium)

| Issue                      | Impact                               | Recommendation                                    |
| -------------------------- | ------------------------------------ | ------------------------------------------------- |
| Hardcoded pricing          | Requires deployment to change prices | Use database-driven pricing (service implemented) |
| No coupon UI               | Cannot apply discounts easily        | Add coupon input to checkout                      |
| Basic recommendation logic | May not suggest optimal plan         | Implement diagnosis-based recommendations         |

### 🟢 OK (Good)

- Stripe Checkout Sessions integration (secure)
- Webhook signature verification
- Idempotency handling
- Dead letter queue for failed webhooks
- Cart abandonment tracking
- Account provisioning automation
- Guided onboarding flow
- Time-to-value optimization

---

## Files Audited

| Category             | Files                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Checkout Routes      | `app/api/checkout/route.ts`, `app/api/stripe/checkout-proposal/route.ts`, `app/api/stripe/checkout-saas/route.ts` |
| Webhook Handling     | `app/api/stripe/webhook/route.ts`, `lib/stripe/webhookRetryService.ts`, `lib/stripe/reconcile.ts`                 |
| Stripe Configuration | `lib/stripe/stripe.ts`, `.env.example`                                                                            |
| Onboarding           | `app/(dashboard)/onboarding/page.tsx`                                                                             |
| Database Schema      | `prisma/schema.prisma`                                                                                            |
| Analytics            | `lib/analytics/cartAbandonmentService.ts`, `app/api/analytics/cart-abandonment/route.ts`                          |
| Pricing              | `lib/stripe/pricingService.ts`, `app/api/pricing/plans/route.ts`                                                  |

---

## Recommendations Summary

1. **🔴 P0:** Implement grace period for subscription renewals (7-14 days)
2. **🟡 P2:** Migrate to database-driven pricing using `lib/stripe/pricingService.ts`
3. **🟡 P2:** Add coupon code input to checkout UI
4. **🟡 P2:** Enhance plan recommendation logic to use diagnosis data

---

**Audit Completed:** March 15, 2026  
**Next Review:** After P0 fix implementation
