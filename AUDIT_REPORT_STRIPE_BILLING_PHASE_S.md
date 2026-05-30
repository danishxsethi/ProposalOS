# Phase S — Stripe & Billing Audit Report

**Audit Date:** March 28, 2026  
**Auditor:** Cline (AI Payments Engineer)  
**Scope:** Stripe Integration & Billing System  
**Status:** ⚠️ PARTIAL IMPLEMENTATION

---

## Executive Summary

The Proposal Engine billing system has a **solid foundation for Agency subscription billing** but has **critical gaps in White-label usage-based billing** and **B2C credit-based billing** implementations.

### Acceptance Criteria Assessment

| Criteria                                    | Status     | Notes                                                |
| ------------------------------------------- | ---------- | ---------------------------------------------------- |
| Zero payment failures from integration bugs | ⚠️ PARTIAL | Agency flow works; white-label & B2C not implemented |
| Webhook processing idempotent               | ✅ PASS    | `processedWebhookEvent` tracking + retry service     |
| Usage metering accurate to the API call     | ❌ FAIL    | Tracking exists but Stripe submission disabled       |

---

## 1. Payment Flow Mapping

### 1.1 Agency Subscription Billing ✅ COVERED

**Flow:** User selects plan → Stripe Checkout → `checkout.session.completed` webhook → Tenant access granted

**Implementation Files:**

- `lib/stripe/pricingService.ts` - Multi-currency pricing service
- `app/api/stripe/checkout-proposal/route.ts` - Checkout session creation
- `app/api/stripe/webhook/route.ts` - Webhook event handlers

**Features:**

- Multi-currency support (7 currencies: USD, EUR, GBP, CAD, AUD, SAR, ILS)
- Tiered pricing: Starter ($99), Pro ($299), Agency ($599)
- Monthly/annual intervals supported

**Code Reference:**

```typescript
// lib/stripe/pricingService.ts - Multi-currency checkout
export async function createCheckoutSession(params: {
  tierId: string;
  planId: string;
  customerEmail: string;
  locale?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session>;
```

### 1.2 White-Label Licensing ⚠️ PARTIAL

**Flow:** API call → `trackUsage()` → UsageRecord created → ❌ Stripe Usage Record NOT submitted

**Implementation Files:**

- `lib/billing/metering.ts` - Usage tracking (Stripe integration commented out)
- `prisma/schema.prisma` - `UsageRecord` model exists

**Critical Issue:**

```typescript
// lib/billing/metering.ts:24-33
// Report to Stripe (Fire and forget, or queue)
// We need the tenant's stripeSubscriptionItemId for the "Usage" price
// Since we didn't add that field yet, we'll skip the actual Stripe API call
// but this is where it would go.

/*
if (stripe && tenant.stripeSubscriptionItemId) {
    await stripe.subscriptionItems.createUsageRecord(
        tenant.stripeSubscriptionItemId,
        {
            quantity: credits,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
        }
    );
}
*/
```

**Missing Components:**

1. Stripe Usage Record submission (commented out)
2. `stripeSubscriptionItemId` population on Tenant
3. Monthly invoice generation via Stripe
4. Overage handling logic

### 1.3 B2C Per-Audit Pricing ❌ NOT IMPLEMENTED

**Required Flow:** User purchases credits → Stripe Checkout → Credit balance updated → Audit deducts credits

**Missing Components:**

- ❌ Credit balance model in Prisma schema
- ❌ Credit pack products/prices in Stripe
- ❌ Atomic credit purchase → balance update
- ❌ Atomic credit deduction per audit
- ❌ Low-balance alerts
- ❌ Auto-refill subscription option

---

## 2. Stripe Integration

### 2.1 API Version Pinning ⚠️ INCONSISTENT

| File                      | API Version         | Status      |
| ------------------------- | ------------------- | ----------- |
| `lib/stripe/stripe.ts`    | `2024-12-18.acacia` | ✅ Primary  |
| `lib/billing/metering.ts` | `2026-01-28.clover` | ⚠️ Mismatch |

**P0 Finding:** API version inconsistency may cause compatibility issues

### 2.2 Webhook Signature Verification ✅ IMPLEMENTED

```typescript
// app/api/stripe/webhook/route.ts
event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
```

**Features:**

- Signature validation on all webhook requests
- Proper error responses for invalid signatures
- Missing header handling

### 2.3 Idempotency ⚠️ PARTIAL

**Implemented:**

- `processedWebhookEvent` model tracks processed Stripe event IDs
- `X-Idempotency-Key` header support in `checkout-proposal` route
- In-memory cache with 24-hour TTL for checkout requests

**Gap:** Idempotency not implemented on all payment routes

```typescript
// app/api/stripe/checkout-proposal/route.ts
const idempotencyKey = req.headers.get('X-Idempotency-Key');
if (idempotencyKey) {
  const cached = IDEMPOTENCY_CACHE.get(idempotencyKey);
  if (cached && Date.now() - cached.timestamp < IDEMPOTENCY_TTL_MS) {
    return NextResponse.json(cached.response as Response, {
      status: cached.statusCode,
      headers: { 'X-Idempotency-Cache': 'true' },
    });
  }
}
```

---

## 3. Subscription Lifecycle

### 3.1 Event Coverage

| Lifecycle Event | Webhook                         | Handler Status                |
| --------------- | ------------------------------- | ----------------------------- |
| Create          | `checkout.session.completed`    | ✅ Implemented                |
| Upgrade         | `customer.subscription.updated` | ✅ Implemented                |
| Downgrade       | `customer.subscription.updated` | ✅ Implemented                |
| Cancel          | `customer.subscription.deleted` | ✅ Implemented                |
| Payment Failure | `invoice.payment_failed`        | ✅ Implemented + Grace Period |
| Payment Success | `invoice.paid`                  | ✅ Implemented                |

### 3.2 Grace Period Implementation ✅

**File:** `lib/tenant/gracePeriodService.ts`

**Features:**

- 7-day grace period for failed payments
- Automatic notifications on days 1, 3, 6
- Service access maintained during grace period
- Auto-expiration and suspension

```typescript
const DEFAULT_CONFIG: GracePeriodConfig = {
  gracePeriodDays: 7,
  notificationDays: [1, 3, 6],
};
```

**Cron Job:** `app/api/cron/check-grace-periods/route.ts` (needs verification)

---

## 4. White-Label Metering

### 4.1 Current State ⚠️ INCOMPLETE

**What Works:**

- Local usage tracking via `UsageRecord` model
- Event cost configuration (`audit.created`, `batch.item`)
- Usage stats aggregation

**What's Broken:**

```typescript
// lib/billing/metering.ts
export async function trackUsage(tenantId: string, event: BillableEvent, quantity: number = 1) {
  // 1. Record in DB ✅
  const record = await prisma.usageRecord.create({...});

  // 2. Report to Stripe ❌ COMMENTED OUT
  /*
  if (stripe && tenant.stripeSubscriptionItemId) {
      await stripe.subscriptionItems.createUsageRecord(...)
  }
  */
}
```

### 4.2 Required Fixes

1. **Uncomment and fix Stripe submission:**

   ```typescript
   if (stripe && tenant.stripeSubscriptionItemId) {
     await stripe.subscriptionItems.createUsageRecord(tenant.stripeSubscriptionItemId, {
       quantity: credits,
       timestamp: Math.floor(Date.now() / 1000),
       action: 'increment',
     });
   }
   ```

2. **Ensure `stripeSubscriptionItemId` is populated:**
   - Update webhook handler to extract from `checkout.session.completed`
   - Store on Tenant model (field exists)

3. **Add usage-based pricing to Stripe:**
   - Create metered billing price
   - Link to subscription item

---

## 5. B2C Credits

### 5.1 Current State ❌ NOT FOUND

No credit system implementation exists in the codebase.

### 5.2 Required Implementation

**Schema Additions:**

```prisma
model CreditBalance {
  id              String   @id @default(uuid())
  tenantId        String   @unique
  balance         Int      @default(0)
  autoRefill      Boolean  @default(false)
  refillThreshold Int      @default(10)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}

model CreditTransaction {
  id          String   @id @default(uuid())
  tenantId    String
  type        String   // 'purchase', 'audit_deduction', 'refund'
  amount      Int      // Positive for credits added, negative for deducted
  auditId     String?
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, createdAt])
  @@index([auditId])
}
```

**Service Functions Needed:**

1. `purchaseCredits(tenantId, packId)` - Atomic balance update
2. `deductCredits(tenantId, auditId, amount)` - Atomic deduction with check
3. `getCreditBalance(tenantId)` - Current balance
4. `checkLowBalance(tenantId)` - Alert threshold check
5. `autoRefill(tenantId)` - Trigger auto-purchase

---

## 6. Webhook Reliability

### 6.1 Signature Verification ✅

```typescript
if (!signature) {
  return NextResponse.json({ error: { code: 'MISSING_HEADER', ... }}, { status: 400 });
}
event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
```

### 6.2 Idempotency ✅

```typescript
const existing = await prisma.processedWebhookEvent.findUnique({ where: { id: event.id } });
if (existing) {
  return NextResponse.json({ received: true, deduplicated: true, eventId: event.id });
}
```

### 6.3 Dead Letter Queue ✅

**Model:** `FailedWebhookEvent`

**Features:**

- Stores failed webhook payloads
- Tracks attempt count
- Resolution tracking

### 6.4 Retry Service ✅

**File:** `lib/stripe/webhookRetryService.ts`

**Configuration:**

- Max attempts: 5
- Retry delay: 1 second (fixed, not exponential)
- Batch size: 100 events per run

**Cron Job:** `app/api/cron/retry-webhooks/route.ts`

### 6.5 Handled Events

| Event                           | Handler | Idempotent | Notes                                   |
| ------------------------------- | ------- | ---------- | --------------------------------------- |
| `checkout.session.completed`    | ✅      | ✅         | Creates subscription, triggers delivery |
| `customer.subscription.updated` | ✅      | ✅         | Updates plan tier, status               |
| `customer.subscription.deleted` | ✅      | ✅         | Suspends tenant access                  |
| `invoice.paid`                  | ✅      | ✅         | Records payment, restores access        |
| `invoice.payment_failed`        | ✅      | ✅         | Starts grace period                     |
| `charge.refunded`               | ❌      | N/A        | NOT IMPLEMENTED                         |
| `refund.created`                | ❌      | N/A        | NOT IMPLEMENTED                         |

---

## 7. Refund Flow

### 7.1 Current State ❌ NOT IMPLEMENTED

No refund handling exists in the codebase.

### 7.2 Required Implementation

**Webhook Handlers:**

1. `charge.refunded` - Full/partial refund notification
2. `refund.created` - Refund object created

**Service Functions:**

1. `processRefund(refundId)` - Main handler
2. `restoreCredits(tenantId, amount)` - For B2C credit refunds
3. `prorateSubscription(tenantId, refundAmount)` - For subscription refunds

**Policy Considerations:**

- Full refund → Full credit restoration
- Partial refund → Proportional credit restoration
- Subscription cancellation → Prorated refund

---

## 8. Findings Summary

### P0 (Critical — Blocks Production)

| #    | Finding                                      | Impact                         | Fix                                                         |
| ---- | -------------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| P0-1 | White-label metering not connected to Stripe | Usage tracked but never billed | Uncomment + fix `trackUsage()` in `lib/billing/metering.ts` |
| P0-2 | B2C credit system not implemented            | No pay-per-audit capability    | Create schema + service (see §5.2)                          |
| P0-3 | API version inconsistency                    | Potential compatibility issues | Standardize to `2024-12-18.acacia`                          |

### P1 (High — Significant Gap)

| #    | Finding                     | Impact                         | Fix                                              |
| ---- | --------------------------- | ------------------------------ | ------------------------------------------------ |
| P1-1 | No refund webhook handlers  | Cannot process refunds         | Add `charge.refunded`, `refund.created` handlers |
| P1-2 | No credit balance model     | B2C billing impossible         | Add `CreditBalance`, `CreditTransaction` models  |
| P1-3 | Idempotency not universal   | Duplicate charge risk          | Add `X-Idempotency-Key` to all payment routes    |
| P1-4 | No low-balance alerts       | B2C users run out unexpectedly | Add `checkLowBalance()` + notifications          |
| P1-5 | No auto-refill subscription | Manual credit purchases only   | Add auto-refill logic + subscription             |

### P2 (Medium — Should Have)

| #    | Finding                          | Impact                          | Fix                                                        |
| ---- | -------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| P2-1 | No usage forecasting             | Unexpected overage charges      | Add usage projection service                               |
| P2-2 | No invoice customization         | White-label branding missing    | Add invoice branding options                               |
| P2-3 | No payment method update webhook | Missed card update events       | Handle `customer.subscription.updated` for payment changes |
| P2-4 | No dunning escalation            | Limited failed payment handling | Add multi-tier dunning sequence                            |

---

## 9. Billing Model Coverage

| Model                   | Components                              | Coverage | Status                         |
| ----------------------- | --------------------------------------- | -------- | ------------------------------ |
| **Agency Subscription** | Checkout, Webhooks, Grace Period, Retry | ~90%     | ✅ PASS (minor fixes)          |
| **White-Label Usage**   | Metering, Usage Records, Invoicing      | ~30%     | ❌ FAIL (Stripe not connected) |
| **B2C Credits**         | Balance, Purchase, Deduction, Alerts    | 0%       | ❌ FAIL (not implemented)      |

---

## 10. Recommendations

### Immediate Actions (Before Production)

1. **Fix P0-1:** Enable Stripe usage record submission

   ```bash
   # Edit lib/billing/metering.ts
   # Uncomment Stripe API call
   # Ensure tenant.stripeSubscriptionItemId is populated
   ```

2. **Fix P0-3:** Standardize API version

   ```typescript
   // Change lib/billing/metering.ts line 7
   apiVersion: '2024-12-18.acacia'; // Was: '2026-01-28.clover'
   ```

3. **Implement P1-1:** Add refund webhook handlers
   ```typescript
   // app/api/stripe/webhook/route.ts
   case 'charge.refunded': { ... }
   case 'refund.created': { ... }
   ```

### Phase 2 (B2C Billing)

1. Create `CreditBalance` and `CreditTransaction` models
2. Implement credit purchase flow
3. Implement atomic credit deduction
4. Add low-balance alerts
5. Add auto-refill subscription

### Phase 3 (Enhancements)

1. Usage forecasting dashboard
2. White-label invoice customization
3. Dunning management escalation
4. Payment method update notifications

---

## 11. Final Verdict

**OVERALL STATUS: FAIL**

| Billing Model        | Verdict |
| -------------------- | ------- |
| Agency Subscription  | ✅ PASS |
| White-Label Metering | ❌ FAIL |
| B2C Credits          | ❌ FAIL |

**Reason:** Two of three billing models are not production-ready. White-label metering has the infrastructure but Stripe integration is disabled. B2C credit system is completely unimplemented.

---

## Appendix A: Files Audited

- `lib/stripe/pricingService.ts`
- `lib/stripe/stripe.ts`
- `lib/stripe/webhookRetryService.ts`
- `lib/stripe/reconcile.ts`
- `lib/billing/metering.ts`
- `lib/tenant/gracePeriodService.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/stripe/checkout-proposal/route.ts`
- `app/api/cron/retry-webhooks/route.ts`
- `app/api/cron/reconcile-billing/route.ts`
- `prisma/schema.prisma`

---

## Appendix B: Webhook Events Matrix

| Event                           | Handler File       | Idempotent | DLQ | Retry |
| ------------------------------- | ------------------ | ---------- | --- | ----- |
| `checkout.session.completed`    | `webhook/route.ts` | ✅         | ✅  | ✅    |
| `customer.subscription.updated` | `webhook/route.ts` | ✅         | ✅  | ✅    |
| `customer.subscription.deleted` | `webhook/route.ts` | ✅         | ✅  | ✅    |
| `invoice.paid`                  | `webhook/route.ts` | ✅         | ✅  | ✅    |
| `invoice.payment_failed`        | `webhook/route.ts` | ✅         | ✅  | ✅    |
| `charge.refunded`               | ❌ Missing         | N/A        | N/A | N/A   |
| `refund.created`                | ❌ Missing         | N/A        | N/A | N/A   |

---

**End of Report**
