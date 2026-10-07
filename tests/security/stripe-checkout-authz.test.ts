import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((fn: unknown) => {
      if (typeof fn === 'function') {
        return (fn as (tx: unknown) => Promise<unknown>)({
          checkoutAttempt: { upsert: vi.fn().mockResolvedValue({}) },
          proposal: { updateMany: vi.fn().mockResolvedValue({}) },
        });
      }
      return Promise.resolve({});
    }),
    checkoutAttempt: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    proposal: {
      updateMany: vi.fn(),
    },
    proposalAcceptance: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/stripe/stripe', () => ({
  getProposalPriceId: vi.fn(() => 'price_test_essentials'),
  stripe: {
    prices: {
      retrieve: vi.fn(),
    },
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  },
}));

vi.mock('@/lib/api/errors', () => ({
  generateTraceId: vi.fn(() => 'trace-test'),
  InternalError: class InternalError {
    constructor(
      public message: string,
      public details?: Record<string, unknown>
    ) {}

    toEnvelope(url: string, traceId: string) {
      return { error: this.message, traceId, url, details: this.details };
    }
  },
}));

vi.mock('@/lib/proposal/publicAccess', () => ({
  PublicProposalAccessError: class PublicProposalAccessError extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  },
  resolvePublicProposalAccess: vi.fn(async (token: string) => {
    if (token !== 'token-1') throw Object.assign(new Error('unexpected token'), { token });
    return {
      tenantId: 'tenant-1',
      proposalId: 'proposal-1',
      proposal: { version: 1 } as unknown,
    };
  }),
}));

import { stripe } from '@/lib/stripe/stripe';

import { POST } from '@/app/api/stripe/checkout-proposal/route';

describe('proposal checkout magic-link authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('creates checkout when token matches the proposal and sets reconciliation metadata', async () => {
    const { prisma } = await import('@/lib/prisma');
    const { getProposalPriceId } = await import('@/lib/stripe/stripe');
    const { resolvePublicProposalAccess } = await import('@/lib/proposal/publicAccess');

    vi.mocked(resolvePublicProposalAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      proposalId: 'proposal-1',
      proposal: { version: 1 } as unknown,
    } as never);
    vi.mocked(prisma.proposalAcceptance.findUnique).mockResolvedValue({
      id: 'acceptance-1',
      proposalId: 'proposal-1',
      tier: 'essentials',
      proposalVersion: 1,
      commercialFingerprint: 'fp-1',
      commercialSnapshot: { amountCents: 5000, currency: 'usd' },
      contactEmail: 'buyer@example.com',
    } as never);
    vi.mocked(prisma.checkoutAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(stripe.prices.retrieve).mockResolvedValue({
      unit_amount: 5000,
      currency: 'usd',
    } as never);
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.test/session',
      status: 'open',
    } as never);

    const response = await POST(
      new Request('http://localhost/api/stripe/checkout-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: 'proposal-1',
          tierId: 'essentials',
          webLinkToken: 'token-1',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://checkout.stripe.test/session',
      checkoutSessionId: 'cs_test_1',
    });
    expect(getProposalPriceId).toHaveBeenCalledWith('essentials');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          proposalId: 'proposal-1',
          tierId: 'essentials',
          tenantId: 'tenant-1',
          checkoutType: 'proposal',
        }),
      }),
      expect.objectContaining({ idempotencyKey: 'proposal-checkout:fp-1' })
    );
  });

  it('returns 404 when token does not match the proposal', async () => {
    const { resolvePublicProposalAccess } = await import('@/lib/proposal/publicAccess');
    vi.mocked(resolvePublicProposalAccess).mockResolvedValue({
      tenantId: 'tenant-1',
      proposalId: 'proposal-1',
      proposal: { version: 1 } as unknown,
    } as never);

    const response = await POST(
      new Request('http://localhost/api/stripe/checkout-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: 'proposal-1',
          tierId: 'essentials',
          webLinkToken: 'wrong-token-for-other-proposal',
        }),
      })
    );

    // wrong-token case: body mapping goes to resolvePublicProposalAccess which
    // fails token→proposal mismatch via proposalId check (404 after resolve).
    // Here we test a valid token mapping to a different proposalId:
    const { prisma } = await import('@/lib/prisma');
    vi.mocked(prisma.proposalAcceptance.findUnique).mockResolvedValue(null);

    // Re-run with mismatched proposalId vs token owner
    vi.mocked(resolvePublicProposalAccess).mockResolvedValueOnce({
      tenantId: 'tenant-1',
      proposalId: 'proposal-1', // token owner
      proposal: { version: 1 } as unknown,
    } as never);

    const r2 = await POST(
      new Request('http://localhost/api/stripe/checkout-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: 'proposal-OTHER',
          tierId: 'essentials',
          webLinkToken: 'token-1',
        }),
      })
    );
    expect(r2.status).toBe(404);
  });

  it('returns 400 when token is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/stripe/checkout-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: 'proposal-1',
          tierId: 'essentials',
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.traceId).toBe('trace-test');
    expect(String(body.error)).toMatch(/Invalid checkout request/);
  });

  it('returns 400 for invalid tiers before Stripe checkout begins', async () => {
    const { stripe: stripeMock } = await import('@/lib/stripe/stripe');
    const response = await POST(
      new Request('http://localhost/api/stripe/checkout-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: 'proposal-1',
          tierId: 'enterprise',
          webLinkToken: 'token-1',
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.traceId).toBe('trace-test');
    expect(String(body.error)).toMatch(/Invalid checkout request/);
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
