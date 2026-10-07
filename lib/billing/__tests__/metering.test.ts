// @vitest-environment node
/**
 * lib/billing/__tests__/metering.test.ts
 *
 * Unit tests for usage metering [#1].
 *
 * Tests:
 *   1. trackUsage writes DB record and calls Stripe meter events API
 *   2. Already-reported records (stripeUsageRecordId set) are skipped
 *   3. Missing stripeCustomerId → Stripe call skipped, record still created
 *   4. Stripe failure → record exists with stripeUsageRecordId null (for retry)
 *   5. Idempotency key uses record.id
 *   6. sweepUnreportedUsage picks up NULL records
 *   7. Stripe not configured (no key) → graceful no-op
 *   8. Live key (sk_live_) → refused (test mode only)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  usageRecordCreate: vi.fn(),
  usageRecordFindUnique: vi.fn(),
  usageRecordFindMany: vi.fn(),
  usageRecordUpdate: vi.fn(),
  usageRecordAggregate: vi.fn(),
  tenantFindUnique: vi.fn(),
  stripeMeterEventsCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    usageRecord: {
      create: mocks.usageRecordCreate,
      findUnique: mocks.usageRecordFindUnique,
      findMany: mocks.usageRecordFindMany,
      update: mocks.usageRecordUpdate,
      aggregate: mocks.usageRecordAggregate,
    },
    tenant: {
      findUnique: mocks.tenantFindUnique,
    },
  },
}));

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      billing = {
        meterEvents: {
          create: mocks.stripeMeterEventsCreate,
        },
      };
      constructor() {}
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

// Set test-mode key so Stripe client is initialized
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';
  process.env.STRIPE_METER_EVENT_NAME = 'audit_credit_used';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// Helper to import fresh module (picks up env changes)
async function importMetering() {
  return import('@/lib/billing/metering');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('trackUsage', () => {
  it('writes a UsageRecord to the DB and reports to Stripe', async () => {
    const recordId = 'rec-001';
    const tenantId = 'tenant-abc';
    const stripeCustomerId = 'cus_test123';

    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId,
      event: 'audit.created',
      credits: 1,
      timestamp: new Date('2026-06-18T12:00:00Z'),
      stripeUsageRecordId: null,
    });

    mocks.usageRecordFindUnique.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date('2026-06-18T12:00:00Z'),
      stripeUsageRecordId: null,
    });

    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId });

    mocks.stripeMeterEventsCreate.mockResolvedValue({
      identifier: `usage-${recordId}`,
    });

    mocks.usageRecordUpdate.mockResolvedValue({});

    const { trackUsage } = await importMetering();
    const result = await trackUsage(tenantId, 'audit.created');

    // DB record created
    expect(mocks.usageRecordCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        event: 'audit.created',
        credits: 1,
      }),
    });

    expect(result).toEqual({ id: recordId, credits: 1 });

    // Wait for async Stripe call
    await new Promise((r) => setTimeout(r, 50));

    // Stripe called with correct params
    expect(mocks.stripeMeterEventsCreate).toHaveBeenCalledWith({
      event_name: 'audit_credit_used',
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: '1',
      },
      identifier: `usage-${recordId}`,
      timestamp: expect.any(Number),
    });

    // stripeUsageRecordId persisted
    expect(mocks.usageRecordUpdate).toHaveBeenCalledWith({
      where: { id: recordId },
      data: { stripeUsageRecordId: `usage-${recordId}` },
    });
  });

  it('skips Stripe report if record already has stripeUsageRecordId', async () => {
    const recordId = 'rec-002';
    const tenantId = 'tenant-abc';

    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    // When the async reporter re-reads, record is already reported
    mocks.usageRecordFindUnique.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: 'already-reported',
    });

    const { trackUsage } = await importMetering();
    await trackUsage(tenantId, 'audit.created');
    await new Promise((r) => setTimeout(r, 50));

    // Stripe NOT called (already reported)
    expect(mocks.stripeMeterEventsCreate).not.toHaveBeenCalled();
  });

  it('skips Stripe if tenant has no stripeCustomerId', async () => {
    const recordId = 'rec-003';
    const tenantId = 'tenant-no-stripe';

    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    mocks.usageRecordFindUnique.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId: null });

    const { trackUsage } = await importMetering();
    const result = await trackUsage(tenantId, 'audit.created');
    await new Promise((r) => setTimeout(r, 50));

    // Record still created in DB
    expect(result).toEqual({ id: recordId, credits: 1 });
    // Stripe NOT called
    expect(mocks.stripeMeterEventsCreate).not.toHaveBeenCalled();
  });

  it('leaves stripeUsageRecordId null on Stripe failure (for retry)', async () => {
    const recordId = 'rec-004';
    const tenantId = 'tenant-abc';

    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    mocks.usageRecordFindUnique.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_test' });
    mocks.stripeMeterEventsCreate.mockRejectedValue(new Error('Stripe API error'));

    const { trackUsage } = await importMetering();
    const result = await trackUsage(tenantId, 'audit.created');
    await new Promise((r) => setTimeout(r, 50));

    // Record created (not blocked by Stripe failure)
    expect(result).toEqual({ id: recordId, credits: 1 });
    // Update NOT called (Stripe failed)
    expect(mocks.usageRecordUpdate).not.toHaveBeenCalled();
  });

  it('uses record.id in the Stripe idempotency identifier', async () => {
    const recordId = 'rec-unique-005';
    const tenantId = 'tenant-abc';

    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    mocks.usageRecordFindUnique.mockResolvedValue({
      id: recordId,
      tenantId,
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_test' });
    mocks.stripeMeterEventsCreate.mockResolvedValue({ identifier: `usage-${recordId}` });
    mocks.usageRecordUpdate.mockResolvedValue({});

    const { trackUsage } = await importMetering();
    await trackUsage(tenantId, 'audit.created');
    await new Promise((r) => setTimeout(r, 50));

    expect(mocks.stripeMeterEventsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: `usage-${recordId}` })
    );
  });
});

describe('sweepUnreportedUsage', () => {
  it('picks up records with stripeUsageRecordId null and reports them', async () => {
    const records = [
      {
        id: 'rec-sweep-1',
        tenantId: 'tenant-a',
        credits: 1,
        timestamp: new Date(),
        stripeUsageRecordId: null,
      },
      {
        id: 'rec-sweep-2',
        tenantId: 'tenant-b',
        credits: 2,
        timestamp: new Date(),
        stripeUsageRecordId: null,
      },
    ];

    mocks.usageRecordFindMany.mockResolvedValue(records);
    mocks.usageRecordFindUnique.mockImplementation(async ({ where }: any) => {
      return records.find((r) => r.id === where.id) ?? null;
    });
    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_sweep' });
    mocks.stripeMeterEventsCreate.mockImplementation(async (params: any) => ({
      identifier: params.identifier,
    }));
    mocks.usageRecordUpdate.mockResolvedValue({});

    const { sweepUnreportedUsage } = await importMetering();
    const result = await sweepUnreportedUsage();

    expect(result.reported).toBe(2);
    expect(result.poisoned).toBe(0);
    expect(mocks.stripeMeterEventsCreate).toHaveBeenCalledTimes(2);
  });

  it('marks records as NOT_BILLABLE when tenant has no stripeCustomerId (poison)', async () => {
    const records = [
      {
        id: 'rec-poison-1',
        tenantId: 'tenant-free',
        credits: 1,
        timestamp: new Date(),
        stripeUsageRecordId: null,
      },
    ];

    mocks.usageRecordFindMany.mockResolvedValue(records);
    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId: null });
    mocks.usageRecordUpdate.mockResolvedValue({});

    const { sweepUnreportedUsage } = await importMetering();
    const result = await sweepUnreportedUsage();

    expect(result.poisoned).toBe(1);
    expect(result.reported).toBe(0);
    expect(mocks.usageRecordUpdate).toHaveBeenCalledWith({
      where: { id: 'rec-poison-1' },
      data: { stripeUsageRecordId: 'NOT_BILLABLE' },
    });
    expect(mocks.stripeMeterEventsCreate).not.toHaveBeenCalled();
  });

  it('marks records older than 34 days as EXPIRED_UNDELIVERED', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);

    const records = [
      {
        id: 'rec-old',
        tenantId: 'tenant-a',
        credits: 1,
        timestamp: oldDate,
        stripeUsageRecordId: null,
      },
    ];

    mocks.usageRecordFindMany.mockResolvedValue(records);
    mocks.tenantFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_test' });
    mocks.usageRecordUpdate.mockResolvedValue({});

    const { sweepUnreportedUsage } = await importMetering();
    const result = await sweepUnreportedUsage();

    expect(result.poisoned).toBe(1);
    expect(mocks.usageRecordUpdate).toHaveBeenCalledWith({
      where: { id: 'rec-old' },
      data: { stripeUsageRecordId: 'EXPIRED_UNDELIVERED' },
    });
    expect(mocks.stripeMeterEventsCreate).not.toHaveBeenCalled();
  });
});

describe('Stripe configuration guards', () => {
  it('does not call Stripe when STRIPE_SECRET_KEY is empty', async () => {
    process.env.STRIPE_SECRET_KEY = '';

    const recordId = 'rec-no-key';
    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId: 'tenant-x',
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    const { trackUsage } = await importMetering();
    await trackUsage('tenant-x', 'audit.created');
    await new Promise((r) => setTimeout(r, 50));

    expect(mocks.stripeMeterEventsCreate).not.toHaveBeenCalled();
  });

  it('refuses live keys (sk_live_) — test mode only', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_real_production_key';

    const recordId = 'rec-live';
    mocks.usageRecordCreate.mockResolvedValue({
      id: recordId,
      tenantId: 'tenant-x',
      credits: 1,
      timestamp: new Date(),
      stripeUsageRecordId: null,
    });

    const { trackUsage } = await importMetering();
    await trackUsage('tenant-x', 'audit.created');
    await new Promise((r) => setTimeout(r, 50));

    // Stripe should NOT be called with a live key
    expect(mocks.stripeMeterEventsCreate).not.toHaveBeenCalled();
  });
});
