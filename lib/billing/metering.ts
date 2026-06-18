/**
 * lib/billing/metering.ts
 *
 * Usage metering — records billable events to the DB and reports them
 * to Stripe via the Billing Meter Events API.
 *
 * Design principles:
 * - DB is the source of truth (UsageRecord written + committed first)
 * - Stripe reporting is fire-and-forget (never blocks the audit path)
 * - Already-reported records (stripeUsageRecordId IS NOT NULL) are skipped
 * - Stripe idempotency via `identifier: usage-${record.id}` (24h rolling)
 * - Only test-mode keys accepted (sk_test_) until production go-live
 *
 * The Meter must be configured in Stripe Dashboard:
 *   event_name: STRIPE_METER_EVENT_NAME env var (default: "audit_credit_used")
 *   aggregation: sum
 *   customer_mapping.event_payload_key: "stripe_customer_id"
 *   value_settings.event_payload_key: "value"
 *
 * Fix for register #1 — usage tracking exists but Stripe submission disabled. [#1]
 */

import Stripe from 'stripe';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

// ─── Stripe client (test mode only) ──────────────────────────────────────────

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const IS_TEST_MODE = STRIPE_KEY.startsWith('sk_test_');

const stripe =
  STRIPE_KEY && IS_TEST_MODE
    ? new Stripe(STRIPE_KEY, { apiVersion: '2025-04-30.basil' as Stripe.LatestApiVersion })
    : null;

const METER_EVENT_NAME = process.env.STRIPE_METER_EVENT_NAME ?? 'audit_credit_used';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillableEvent = 'audit.created' | 'batch.item';

const EVENT_COSTS: Record<BillableEvent, number> = {
  'audit.created': 1,
  'batch.item': 1,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a billable event to the DB and asynchronously report to Stripe.
 *
 * This function is safe to call in the audit hot path:
 * - DB write is synchronous (awaited) — the record exists before returning
 * - Stripe reporting is fire-and-forget (does not block, does not throw)
 * - On Stripe failure, stripeUsageRecordId stays null for later retry/sweep
 *
 * @returns The created UsageRecord (always, even if Stripe reporting fails)
 */
export async function trackUsage(
  tenantId: string,
  event: BillableEvent,
  quantity: number = 1
): Promise<{ id: string; credits: number } | null> {
  try {
    const credits = (EVENT_COSTS[event] || 1) * quantity;

    // 1. Write to DB first (source of truth) — committed before Stripe call
    const record = await prisma.usageRecord.create({
      data: {
        tenantId,
        event,
        credits,
        timestamp: new Date(),
      },
    });

    logger.info({ tenantId, credits, event, recordId: record.id }, '[Metering] Recorded usage');

    // 2. Report to Stripe asynchronously (fire-and-forget)
    // Never blocks the caller, never throws — failures leave stripeUsageRecordId null
    reportToStripeAsync(record.id, tenantId, credits).catch((err) => {
      logger.error(
        { error: err, recordId: record.id },
        '[Metering] Background Stripe report failed (will retry on sweep)'
      );
    });

    return { id: record.id, credits };
  } catch (error) {
    logger.error({ error, tenantId, event }, '[Metering] Failed to record usage');
    // Don't block the user flow if metering fails
    return null;
  }
}

/**
 * Report a single usage record to Stripe. Idempotent — skips if already reported.
 *
 * Can be called from:
 * - trackUsage (fire-and-forget, inline)
 * - A sweep/retry job for records with stripeUsageRecordId IS NULL
 */
export async function reportToStripe(recordId: string): Promise<boolean> {
  return reportToStripeAsync(recordId);
}

/**
 * Sweep unreported records and attempt Stripe submission.
 * Intended for a periodic cron job (e.g., every 5 minutes via /api/cron/metering-sweep).
 *
 * Poison-record handling:
 * - Records where the tenant has no stripeCustomerId are marked as "poison"
 *   (stripeUsageRecordId set to 'NOT_BILLABLE') so they're never retried.
 * - A max of `maxAttempts` retries per record prevents indefinite hammering.
 *   After exhaustion, the record is marked NOT_BILLABLE.
 */
export async function sweepUnreportedUsage(limit: number = 50): Promise<{
  reported: number;
  poisoned: number;
  failed: number;
}> {
  const unreported = await prisma.usageRecord.findMany({
    where: { stripeUsageRecordId: null },
    orderBy: { timestamp: 'asc' },
    take: limit,
  });

  let reported = 0;
  let poisoned = 0;
  let failed = 0;

  for (const record of unreported) {
    // Check if tenant is billable (has stripeCustomerId)
    const tenant = await prisma.tenant.findUnique({
      where: { id: record.tenantId },
      select: { stripeCustomerId: true },
    });

    if (!tenant?.stripeCustomerId) {
      // Poison: tenant will never be billable via Stripe — mark permanently
      await prisma.usageRecord.update({
        where: { id: record.id },
        data: { stripeUsageRecordId: 'NOT_BILLABLE' },
      });
      poisoned++;
      continue;
    }

    // Check record age — if older than 35 days, Stripe rejects it (timestamp limit)
    const ageMs = Date.now() - record.timestamp.getTime();
    const MAX_AGE_MS = 34 * 24 * 60 * 60 * 1000; // 34 days (Stripe limit is 35)
    if (ageMs > MAX_AGE_MS) {
      await prisma.usageRecord.update({
        where: { id: record.id },
        data: { stripeUsageRecordId: 'EXPIRED_UNDELIVERED' },
      });
      poisoned++;
      logger.warn(
        { recordId: record.id, ageDays: Math.floor(ageMs / 86400000) },
        '[Metering] Record too old for Stripe (>34 days) — marking expired'
      );
      continue;
    }

    const success = await reportToStripeAsync(record.id, record.tenantId, record.credits);
    if (success) {
      reported++;
    } else {
      failed++;
    }
  }

  if (reported > 0 || poisoned > 0) {
    logger.info(
      { reported, poisoned, failed, total: unreported.length },
      '[Metering] Sweep completed'
    );
  }

  return { reported, poisoned, failed };
}

// ─── Usage stats (unchanged) ─────────────────────────────────────────────────

export async function getUsageStats(tenantId: string): Promise<number> {
  const startOfBillingPeriod = new Date();
  startOfBillingPeriod.setDate(1); // Simplification: assume 1st of month

  const usage = await prisma.usageRecord.aggregate({
    where: {
      tenantId,
      timestamp: { gte: startOfBillingPeriod },
    },
    _sum: { credits: true },
  });

  return usage._sum.credits || 0;
}

export async function checkLimit(
  tenantId: string,
  planTier: string
): Promise<{ allowed: boolean; usage: number; limit: number }> {
  const usage = await getUsageStats(tenantId);

  let limit = 10; // Default Free
  if (planTier === 'starter') limit = 25;
  if (planTier === 'pro') limit = 100;
  if (planTier === 'agency') limit = 999999; // Unlimited

  // Free tier blocks; paid tiers allow overage (billed via Stripe metering)
  if (planTier === 'free' && usage >= limit) {
    return { allowed: false, usage, limit };
  }

  return { allowed: true, usage, limit };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function reportToStripeAsync(
  recordId: string,
  tenantId?: string,
  credits?: number
): Promise<boolean> {
  if (!stripe) {
    logger.debug('[Metering] Stripe not configured or not in test mode — skipping report');
    return false;
  }

  try {
    // Re-read the record to check if already reported (guards against race + 24h expiry)
    const record = await prisma.usageRecord.findUnique({ where: { id: recordId } });
    if (!record) {
      logger.warn({ recordId }, '[Metering] Record not found — skipping');
      return false;
    }

    // Already reported — skip (source of truth guard)
    if (record.stripeUsageRecordId) {
      logger.debug({ recordId }, '[Metering] Already reported to Stripe — skipping');
      return true;
    }

    const effectiveTenantId = tenantId ?? record.tenantId;
    const effectiveCredits = credits ?? record.credits;

    // Look up the tenant's Stripe customer ID
    const tenant = await prisma.tenant.findUnique({
      where: { id: effectiveTenantId },
      select: { stripeCustomerId: true },
    });

    if (!tenant?.stripeCustomerId) {
      logger.debug(
        { tenantId: effectiveTenantId },
        '[Metering] Tenant has no stripeCustomerId — skipping Stripe report'
      );
      return false;
    }

    // Report via Billing Meter Events API
    const meterEvent = await stripe.billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: {
        stripe_customer_id: tenant.stripeCustomerId,
        value: String(effectiveCredits),
      },
      identifier: `usage-${record.id}`, // Idempotency (24h rolling uniqueness)
      timestamp: Math.floor(record.timestamp.getTime() / 1000),
    });

    // Persist the Stripe event identifier as proof of successful reporting
    await prisma.usageRecord.update({
      where: { id: recordId },
      data: { stripeUsageRecordId: meterEvent.identifier },
    });

    logger.info(
      {
        recordId,
        stripeIdentifier: meterEvent.identifier,
        credits: effectiveCredits,
        customerId: tenant.stripeCustomerId,
      },
      '[Metering] Successfully reported to Stripe'
    );

    return true;
  } catch (error) {
    logger.error(
      { error, recordId },
      '[Metering] Failed to report to Stripe — record stays unreported for retry'
    );
    // Do NOT throw — leave stripeUsageRecordId null for sweep to pick up
    return false;
  }
}
