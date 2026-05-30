import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    proposal: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    checkoutAttempt: {
      create: vi.fn(),
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

import { prisma } from '@/lib/prisma';
import { getProposalPriceId, stripe } from '@/lib/stripe/stripe';

import { POST } from '@/app/api/stripe/checkout-proposal/route';

describe('proposal checkout magic-link authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = 'http://localhost:3000';
  });

  it('creates checkout when token matches the proposal and sets reconciliation metadata', async () => {
    (prisma.proposal.findFirst as any).mockResolvedValue({
      id: 'proposal-1',
      tenantId: 'tenant-1',
      pricing: { essentials: 50 },
      webLinkToken: 'token-1',
      prospectEmail: 'buyer@example.com',
    });
    (stripe.prices.retrieve as any).mockResolvedValue({ unit_amount: 5000 });
    (prisma.proposal.update as any).mockResolvedValue({});
    (stripe.checkout.sessions.create as any).mockResolvedValue({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.test/session',
    });
    (prisma.checkoutAttempt.create as any).mockResolvedValue({});

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
    });
    expect(prisma.proposal.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'proposal-1',
        webLinkToken: 'token-1',
      },
    });
    expect(getProposalPriceId).toHaveBeenCalledWith('essentials');
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          proposalId: 'proposal-1',
          tierId: 'essentials',
          tenantId: 'tenant-1',
          checkoutType: 'proposal',
        },
      })
    );
  });

  it('returns 404 when token does not match the proposal', async () => {
    (prisma.proposal.findFirst as any).mockResolvedValue(null);

    const response = await POST(
      new Request('http://localhost/api/stripe/checkout-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: 'proposal-1',
          tierId: 'essentials',
          webLinkToken: 'wrong-token',
        }),
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
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
    await expect(response.json()).resolves.toEqual({
      error: 'Missing or invalid proposalId/tierId/webLinkToken',
    });
    expect(prisma.proposal.findFirst).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid tiers before Stripe checkout begins', async () => {
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
    await expect(response.json()).resolves.toEqual({
      error: 'Missing or invalid proposalId/tierId/webLinkToken',
    });
    expect(prisma.proposal.findFirst).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
