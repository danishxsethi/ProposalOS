// @vitest-environment node
/**
 * tests/reliability/stripe-webhook-duplicate.test.ts
 *
 * Stream D — S4: duplicate Stripe webhook delivery.
 *
 * REAL PostgreSQL (disposable per-file DB). The ProcessedWebhookEvent PK +
 * createMany({ skipDuplicates }) reservation and the tenant-scoped Payment /
 * Tenant writes are exercised against real rows. Only the Stripe SDK client,
 * Stripe env validation, and the audit-trail sink are stubbed (external to the
 * dedup contract under test). Signature verification is bypassed the same way
 * tests/security/stripe-webhook-signature-idempotency.test.ts does — by calling
 * handleStripeWebhookEvent directly with an already-constructed event object.
 *
 * Covers:
 *   S4a Sequential redelivery of the identical event.id → second call returns
 *       deduplicated:true; exactly one ProcessedWebhookEvent row; side effects
 *       (Payment upsert) applied exactly once.
 *   S4b Concurrent delivery (Promise.all) of the identical event.id → exactly one
 *       ProcessedWebhookEvent row and one Payment row; the loser's result shape is
 *       recorded (it returns received:true without the deduplicated flag because
 *       it lost at the createMany reservation, not at the pre-check).
 */
import { randomUUID } from 'node:crypto';

import type Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { activateRealDb, type RealDbSession } from '../helpers/realDb';

const session: RealDbSession = await activateRealDb('reliability_webhook');

const stripeMocks = vi.hoisted(() => ({
  subscriptionsRetrieve: vi.fn(),
}));

vi.mock('@/lib/stripe/stripe', () => ({
  stripe: { subscriptions: { retrieve: stripeMocks.subscriptionsRetrieve } },
  stripeSecretKey: () => 'sk_test_reliability_fixture',
  assertBillingNotFrozen: () => {
    if (process.env.KILL_SWITCH_FORCE_MANUAL_MODE === 'true') {
      throw new Error('[BILLING FROZEN]');
    }
  },
  getPlanTierFromPriceId: () => 'free',
}));
vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: vi.fn().mockResolvedValue(undefined),
}));

const { handleStripeWebhookEvent } = await import('@/lib/stripe/webhookHandler');
const { prisma } = await import('@/lib/prisma');
const { runWithTenantBypass } = await import('@/lib/tenant/context');

function invoicePaidEvent(eventId: string, customerId: string, invoiceId: string): Stripe.Event {
  return {
    id: eventId,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: 'invoice.paid',
    data: {
      object: {
        id: invoiceId,
        object: 'invoice',
        customer: customerId,
        amount_paid: 29900,
        currency: 'usd',
        status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
      } as unknown as Stripe.Invoice,
    },
  } as unknown as Stripe.Event;
}

describe('Stream D — S4 duplicate Stripe webhook (real PostgreSQL)', () => {
  let tenantId: string;
  let customerId: string;

  beforeAll(async () => {
    tenantId = randomUUID();
    customerId = `cus_rel_${tenantId.slice(0, 8)}`;
    await runWithTenantBypass('test-fixture:create-tenant', () =>
      prisma.tenant.create({
        data: {
          id: tenantId,
          name: 'Webhook Reliability Tenant',
          slug: `wh-${tenantId}`,
          stripeCustomerId: customerId,
          subscriptionStatus: 'past_due',
        },
      })
    );
    delete process.env.KILL_SWITCH_FORCE_MANUAL_MODE;
  });

  afterAll(async () => {
    await session.cleanup();
  });

  const processedCount = (eventId: string) =>
    runWithTenantBypass('test-fixture:count-processed', () =>
      prisma.processedWebhookEvent.count({ where: { id: eventId } })
    );
  const paymentsForInvoice = (invoiceId: string) =>
    runWithTenantBypass('test-fixture:count-payments', () =>
      prisma.payment.findMany({ where: { stripeInvoiceId: invoiceId } })
    );

  it('S4a: identical event delivered twice sequentially → second is deduplicated, one ProcessedWebhookEvent row, side effects once', async () => {
    const eventId = `evt_rel_seq_${randomUUID().slice(0, 8)}`;
    const invoiceId = `in_rel_seq_${randomUUID().slice(0, 8)}`;
    // Two distinct object instances with identical content (as two Stripe
    // deliveries would be after separate signature verifications).
    const first = invoicePaidEvent(eventId, customerId, invoiceId);
    const second = invoicePaidEvent(eventId, customerId, invoiceId);

    const r1 = await handleStripeWebhookEvent(first);
    expect(r1).toEqual({ received: true, eventId });
    expect(await processedCount(eventId)).toBe(1);
    const paymentsAfterFirst = await paymentsForInvoice(invoiceId);
    expect(paymentsAfterFirst).toHaveLength(1);
    expect(paymentsAfterFirst[0]!.status).toBe('paid');
    expect(paymentsAfterFirst[0]!.tenantId).toBe(tenantId);

    const tenantAfterFirst = await runWithTenantBypass('test-fixture:read-tenant', () =>
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
    );
    expect(tenantAfterFirst.subscriptionStatus).toBe('active');

    // Mutate tenant state so a replayed side-effect would be visible.
    await runWithTenantBypass('test-fixture:perturb-tenant', () =>
      prisma.tenant.update({ where: { id: tenantId }, data: { subscriptionStatus: 'sentinel_no_replay' } })
    );

    const r2 = await handleStripeWebhookEvent(second);
    expect(r2).toEqual({ received: true, deduplicated: true, eventId });
    expect(await processedCount(eventId)).toBe(1);
    expect(await paymentsForInvoice(invoiceId)).toHaveLength(1);
    const tenantAfterSecond = await runWithTenantBypass('test-fixture:read-tenant', () =>
      prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
    );
    // Replay must not re-apply the invoice.paid side effect.
    expect(tenantAfterSecond.subscriptionStatus).toBe('sentinel_no_replay');

    // Third delivery is also a no-op.
    const r3 = await handleStripeWebhookEvent(invoicePaidEvent(eventId, customerId, invoiceId));
    expect(r3.deduplicated).toBe(true);
    expect(await processedCount(eventId)).toBe(1);
  });

  it('S4b: identical event delivered concurrently (Promise.all) → exactly one ProcessedWebhookEvent row and one Payment row', async () => {
    const eventId = `evt_rel_par_${randomUUID().slice(0, 8)}`;
    const invoiceId = `in_rel_par_${randomUUID().slice(0, 8)}`;

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => handleStripeWebhookEvent(invoicePaidEvent(eventId, customerId, invoiceId)))
    );

    // No delivery may error out: Stripe would retry and the tenant would see 5xx noise.
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected.map((r) => (r.reason as Error).message)).toEqual([]);

    const fulfilled = results.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof handleStripeWebhookEvent>>>).value);
    expect(fulfilled.every((r) => r.received && r.eventId === eventId)).toBe(true);

    expect(await processedCount(eventId)).toBe(1);
    expect(await paymentsForInvoice(invoiceId)).toHaveLength(1);

    // Record (for the closure doc) how the losers reported: the pre-check
    // findUnique races through for all callers, so the losers are stopped by the
    // createMany reservation (count===0 → return) and report received:true
    // WITHOUT deduplicated:true. The route layer returns 200 for both shapes,
    // so Stripe stops retrying either way.
    const dedupFlagged = fulfilled.filter((r) => r.deduplicated === true).length;
    // eslint-disable-next-line no-console
    console.info(
      `[S4b] concurrent deliveries=${fulfilled.length}; results with deduplicated:true=${dedupFlagged}; ` +
        `results with received:true only=${fulfilled.length - dedupFlagged}`
    );
  });

  it('S4c: kill switch (KILL_SWITCH_FORCE_MANUAL_MODE=true) freezes webhook mutations before any row is written', async () => {
    process.env.KILL_SWITCH_FORCE_MANUAL_MODE = 'true';
    const eventId = `evt_rel_frozen_${randomUUID().slice(0, 8)}`;
    const invoiceId = `in_rel_frozen_${randomUUID().slice(0, 8)}`;
    try {
      await expect(handleStripeWebhookEvent(invoicePaidEvent(eventId, customerId, invoiceId))).rejects.toThrow(
        /BILLING FROZEN/
      );
      expect(await processedCount(eventId)).toBe(0);
      expect(await paymentsForInvoice(invoiceId)).toHaveLength(0);
    } finally {
      delete process.env.KILL_SWITCH_FORCE_MANUAL_MODE;
    }
  });
});
