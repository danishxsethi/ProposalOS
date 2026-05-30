// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';

const mocks = vi.hoisted(() => ({
  runWithTenantAsync: vi.fn((tenantId, cb) => cb()),
  runWithTenantBypass: vi.fn((reason, cb) => cb()),

  processedWebhookFindUnique: vi.fn(),
  processedWebhookCreate: vi.fn(),
  failedWebhookUpsert: vi.fn(),
  proposalFindUnique: vi.fn(),
  proposalUpdate: vi.fn(),
  tenantFindFirst: vi.fn(),
  tenantUpdate: vi.fn(),
  checkoutAttemptUpdateMany: vi.fn(),
  projectUpsert: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  subscriptionUpsert: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  paymentFindUnique: vi.fn(),
  paymentUpsert: vi.fn(),

  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

const mockHeaders = new Map<string, string>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => {
      return mockHeaders.get(key.toLowerCase()) || null;
    },
  })),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: mocks.runWithTenantAsync,
  runWithTenantBypass: mocks.runWithTenantBypass,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    processedWebhookEvent: {
      findUnique: mocks.processedWebhookFindUnique,
      create: mocks.processedWebhookCreate,
    },
    failedWebhookEvent: {
      upsert: mocks.failedWebhookUpsert,
    },
    proposal: {
      findUnique: mocks.proposalFindUnique,
      update: mocks.proposalUpdate,
    },
    tenant: {
      findFirst: mocks.tenantFindFirst,
      update: mocks.tenantUpdate,
    },
    checkoutAttempt: {
      updateMany: mocks.checkoutAttemptUpdateMany,
    },
    project: {
      upsert: mocks.projectUpsert,
    },
    subscription: {
      findUnique: mocks.subscriptionFindUnique,
      upsert: mocks.subscriptionUpsert,
      updateMany: mocks.subscriptionUpdateMany,
    },
    payment: {
      findUnique: mocks.paymentFindUnique,
      upsert: mocks.paymentUpsert,
    },
    $transaction: vi.fn(async (cb) => {
      return await cb({
        processedWebhookEvent: {
          create: mocks.processedWebhookCreate,
        },
        failedWebhookEvent: {
          upsert: mocks.failedWebhookUpsert,
        },
        proposal: {
          findUnique: mocks.proposalFindUnique,
          update: mocks.proposalUpdate,
        },
        tenant: {
          findFirst: mocks.tenantFindFirst,
          update: mocks.tenantUpdate,
        },
        checkoutAttempt: {
          updateMany: mocks.checkoutAttemptUpdateMany,
        },
        project: {
          upsert: mocks.projectUpsert,
        },
        subscription: {
          findUnique: mocks.subscriptionFindUnique,
          upsert: mocks.subscriptionUpsert,
          updateMany: mocks.subscriptionUpdateMany,
        },
        payment: {
          findUnique: mocks.paymentFindUnique,
          upsert: mocks.paymentUpsert,
        },
      });
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}));

import { POST } from '@/app/api/stripe/webhook/route';
import { stripe } from '@/lib/stripe/stripe';

describe('Stripe webhook security & idempotency suite', () => {
  const testSecret = 'whsec_test_secret_key_12345';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret_key_12345';
    process.env.STRIPE_WEBHOOK_SECRET = testSecret;
  });

  const makeRequest = (body: string, signature: string | null) => {
    mockHeaders.clear();
    const headers: Record<string, string> = {};
    if (signature) {
      headers['Stripe-Signature'] = signature;
      mockHeaders.set('stripe-signature', signature);
    }
    return new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers,
      body,
    });
  };

  it('rejects POST request with missing signature (400)', async () => {
    const res = await POST(makeRequest('{}', null));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('MISSING_HEADER');
    expect(data.error.message).toContain('Missing Stripe signature');
  });

  it('rejects POST request with invalid signature (400)', async () => {
    const res = await POST(makeRequest('{}', 'invalid_sig_here'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toContain('Webhook Error:');
  });

  it('rejects POST request with malformed body payload (400)', async () => {
    const badBody = 'this-is-not-json';
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: badBody,
      secret: testSecret,
    });
    const res = await POST(makeRequest(badBody, sig));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });

  it('fails closed if stripe webhook secret is missing (500)', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.message).toContain('Webhook processing failed');
  });

  it('deduplicates a duplicate processed event ID without repeating side effects (200)', async () => {
    const bodyObj = {
      id: 'evt_123',
      type: 'checkout.session.completed',
      livemode: false,
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    // Mock that the event is already processed
    mocks.processedWebhookFindUnique.mockResolvedValue({
      id: 'evt_123',
      type: 'checkout.session.completed',
    });

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.deduplicated).toBe(true);

    // Verify no transactional writes were invoked
    expect(mocks.processedWebhookCreate).not.toHaveBeenCalled();
    expect(mocks.proposalUpdate).not.toHaveBeenCalled();
  });

  it('rejects a livemode event in test mode environments to prevent environment bleed', async () => {
    const bodyObj = {
      id: 'evt_live_123',
      type: 'checkout.session.completed',
      livemode: true, // Livemode event
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.message).toContain('Webhook processing failed');
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_live_123' }),
      expect.stringContaining('Received livemode Stripe webhook event in test/dev environment')
    );
  });

  it('correctly validates, processes, and tenant-isolates a fresh checkout.session.completed event (200)', async () => {
    const bodyObj = {
      id: 'evt_fresh_123',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_123',
          metadata: {
            proposalId: 'prop_abc',
            tierId: 'growth',
          },
        },
      },
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);
    mocks.processedWebhookCreate.mockResolvedValue({});
    mocks.proposalFindUnique.mockResolvedValue({ id: 'prop_abc', tenantId: 'tenant_xyz' });
    mocks.proposalUpdate.mockResolvedValue({ id: 'prop_abc', tenantId: 'tenant_xyz' });
    mocks.projectUpsert.mockResolvedValue({});

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
    expect(data.eventId).toBe('evt_fresh_123');

    // Tenant isolation verification:
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant_xyz', expect.any(Function));
    expect(mocks.proposalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prop_abc' },
        data: expect.objectContaining({ status: 'PAID' }),
      })
    );
  });

  it('safely handles invoice.paid events under the correct resolved tenant context', async () => {
    const bodyObj = {
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      livemode: false,
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_xyz',
          amount_paid: 29900,
          currency: 'usd',
        },
      },
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);
    mocks.processedWebhookCreate.mockResolvedValue({});
    mocks.tenantFindFirst.mockResolvedValue({ id: 'tenant_xyz' });
    mocks.tenantUpdate.mockResolvedValue({});
    mocks.subscriptionUpdateMany.mockResolvedValue({});
    mocks.paymentUpsert.mockResolvedValue({});

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(200);

    // Verify lookup was executed under bypass
    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith('stripe-webhook-customer-lookup', expect.any(Function));
    // Verify processing was isolated to the resolved tenant
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant_xyz', expect.any(Function));
    expect(mocks.paymentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeInvoiceId: 'in_123' },
        create: expect.objectContaining({ tenantId: 'tenant_xyz', status: 'paid' }),
      })
    );
  });

  it('skips processing of invoice.payment_failed if invoice is already marked paid (replay safeguard)', async () => {
    const bodyObj = {
      id: 'evt_failed_replay',
      type: 'invoice.payment_failed',
      livemode: false,
      data: {
        object: {
          id: 'in_paid_already',
          customer: 'cus_xyz',
          amount_due: 29900,
          currency: 'usd',
        },
      },
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);
    mocks.processedWebhookCreate.mockResolvedValue({});
    mocks.tenantFindFirst.mockResolvedValue({ id: 'tenant_xyz' });
    mocks.paymentFindUnique.mockResolvedValue({ status: 'paid' }); // Already paid in DB

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(200);

    // Verify payment upsert was skipped
    expect(mocks.paymentUpsert).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'in_paid_already' }),
      expect.stringContaining('Skipped invoice.payment_failed since invoice is already marked paid in DB')
    );
  });

  it('skips out-of-order customer.subscription.updated events when the DB holds a more recent subscription state', async () => {
    const bodyObj = {
      id: 'evt_sub_old',
      type: 'customer.subscription.updated',
      livemode: false,
      data: {
        object: {
          id: 'sub_xyz',
          customer: 'cus_xyz',
          current_period_end: 100000000, // old timestamp
          items: {
            data: [{ price: { id: 'price_pro' } }],
          },
        },
      },
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);
    mocks.processedWebhookCreate.mockResolvedValue({});
    mocks.tenantFindFirst.mockResolvedValue({ id: 'tenant_xyz' });
    mocks.subscriptionFindUnique.mockResolvedValue({
      currentPeriodEnd: new Date(200000000 * 1000), // DB has newer currentPeriodEnd
    });

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(200);

    // Verify subscription upsert was skipped
    expect(mocks.subscriptionUpsert).not.toHaveBeenCalled();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub_xyz' }),
      expect.stringContaining('Skipped out-of-order customer.subscription.updated event')
    );
  });

  it('records transient processing failures to failedWebhookEvent and throws proper 500 error', async () => {
    const bodyObj = {
      id: 'evt_transient_error',
      type: 'invoice.paid',
      livemode: false,
      data: {
        object: {
          id: 'in_err',
          customer: 'cus_xyz',
        },
      },
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);
    mocks.tenantFindFirst.mockResolvedValue({ id: 'tenant_xyz' });
    // Force write operation to fail (simulate DB connection drop)
    mocks.processedWebhookCreate.mockRejectedValue(new Error('DB connection drop'));

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(500);

    // Verify failure is recorded to FailedWebhookEvent
    expect(mocks.failedWebhookUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'evt_transient_error' },
        create: expect.objectContaining({
          eventId: 'evt_transient_error',
          errorMessage: 'DB connection drop',
          tenantId: 'tenant_xyz',
        }),
      })
    );
  });

  it('safely processes and logs unhandled or unsupported event types as ignored (200)', async () => {
    const bodyObj = {
      id: 'evt_unsupported',
      type: 'charge.dispute.created',
      livemode: false,
      data: {
        object: {},
      },
    };
    const body = JSON.stringify(bodyObj);
    const sig = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: testSecret,
    });

    mocks.processedWebhookFindUnique.mockResolvedValue(null);
    mocks.processedWebhookCreate.mockResolvedValue({});

    const res = await POST(makeRequest(body, sig));
    expect(res.status).toBe(200);

    // Verified: No tenant lookup is done, processed under system bypass
    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith('stripe-webhook-system-event', expect.any(Function));
    expect(mocks.processedWebhookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { id: 'evt_unsupported', type: 'charge.dispute.created' },
      })
    );
  });
});
