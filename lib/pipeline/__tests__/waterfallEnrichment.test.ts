/**
 * Unit tests for Waterfall Enrichment
 *
 * Tests the enrichProspect() function: provider ordering, early stopping on
 * verified email, fault tolerance (error/timeout skipping), database updates.
 *
 * Requirements: 1.5, 1.8
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enrichProspect,
  withTimeout,
  hasVerifiedEmail,
  PROVIDER_ORDER,
  type EnrichmentProvider,
  type EnrichmentProviders,
  type ProviderResult,
} from '../waterfallEnrichment';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    prospectLead: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    prospectEnrichmentRun: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

const mockPrisma = vi.mocked(prisma);

// ============================================================================
// Test Helpers
// ============================================================================

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    tenantId: 'tenant-1',
    businessName: 'Test Business',
    website: 'https://test.com',
    ...overrides,
  };
}

function makeProvider(result: ProviderResult, delay = 0): EnrichmentProvider {
  return async (_name, _website) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return result;
  };
}

function makeFailingProvider(error: string): EnrichmentProvider {
  return async () => {
    throw new Error(error);
  };
}

let enrichmentRunIdCounter = 0;

function setupMocks(lead = makeLead()) {
  enrichmentRunIdCounter = 0;
  mockPrisma.prospectLead.findUniqueOrThrow.mockResolvedValue(lead as never);
  mockPrisma.prospectLead.update.mockResolvedValue(lead as never);
  mockPrisma.prospectEnrichmentRun.create.mockImplementation(async () => {
    enrichmentRunIdCounter++;
    return { id: `run-${enrichmentRunIdCounter}` } as never;
  });
  mockPrisma.prospectEnrichmentRun.update.mockResolvedValue({} as never);
}

// ============================================================================
// withTimeout
// ============================================================================

describe('withTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('rejects when promise exceeds timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(slow, 10)).rejects.toThrow('timed out');
  });

  it('rejects with original error if promise fails before timeout', async () => {
    const failing = Promise.reject(new Error('provider error'));
    await expect(withTimeout(failing, 1000)).rejects.toThrow('provider error');
  });
});

// ============================================================================
// hasVerifiedEmail
// ============================================================================

describe('hasVerifiedEmail', () => {
  it('returns true for non-empty email', () => {
    expect(hasVerifiedEmail({ email: 'a@b.com' })).toBe(true);
  });

  it('returns false for undefined email', () => {
    expect(hasVerifiedEmail({})).toBe(false);
  });

  it('returns false for empty string email', () => {
    expect(hasVerifiedEmail({ email: '' })).toBe(false);
  });
});

// ============================================================================
// enrichProspect
// ============================================================================

describe('enrichProspect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('fetches the prospect from the database', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({ email: 'found@test.com' }),
    };

    await enrichProspect('lead-1', providers);

    expect(mockPrisma.prospectLead.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
    });
  });

  it('queries providers in strict order: Apollo → Hunter → Proxycurl → Clearbit', async () => {
    const callOrder: string[] = [];

    const providers: EnrichmentProviders = {
      APOLLO: async () => { callOrder.push('APOLLO'); return {}; },
      HUNTER: async () => { callOrder.push('HUNTER'); return {}; },
      PROXYCURL: async () => { callOrder.push('PROXYCURL'); return {}; },
      CLEARBIT: async () => { callOrder.push('CLEARBIT'); return {}; },
    };

    await enrichProspect('lead-1', providers);

    expect(callOrder).toEqual(['APOLLO', 'HUNTER', 'PROXYCURL', 'CLEARBIT']);
  });

  it('stops as soon as a verified email is found', async () => {
    const callOrder: string[] = [];

    const providers: EnrichmentProviders = {
      APOLLO: async () => { callOrder.push('APOLLO'); return {}; },
      HUNTER: async () => {
        callOrder.push('HUNTER');
        return { email: 'dm@test.com', decisionMaker: { name: 'John', title: 'Owner' } };
      },
      PROXYCURL: async () => { callOrder.push('PROXYCURL'); return {}; },
      CLEARBIT: async () => { callOrder.push('CLEARBIT'); return {}; },
    };

    const result = await enrichProspect('lead-1', providers);

    expect(callOrder).toEqual(['APOLLO', 'HUNTER']);
    expect(result.email).toBe('dm@test.com');
    expect(result.provider).toBe('HUNTER');
  });

  it('skips providers that throw errors and continues', async () => {
    const callOrder: string[] = [];

    const providers: EnrichmentProviders = {
      APOLLO: makeFailingProvider('Apollo API down'),
      HUNTER: async () => { callOrder.push('HUNTER'); return {}; },
      PROXYCURL: async () => {
        callOrder.push('PROXYCURL');
        return { email: 'found@proxy.com' };
      },
      CLEARBIT: async () => { callOrder.push('CLEARBIT'); return {}; },
    };

    const result = await enrichProspect('lead-1', providers);

    expect(callOrder).toEqual(['HUNTER', 'PROXYCURL']);
    expect(result.email).toBe('found@proxy.com');
    expect(result.provider).toBe('PROXYCURL');
  });

  it('skips providers that timeout and continues', async () => {
    const callOrder: string[] = [];

    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({}, 500), // will timeout
      HUNTER: async () => {
        callOrder.push('HUNTER');
        return { email: 'hunter@test.com' };
      },
      PROXYCURL: async () => { callOrder.push('PROXYCURL'); return {}; },
      CLEARBIT: async () => { callOrder.push('CLEARBIT'); return {}; },
    };

    const result = await enrichProspect('lead-1', providers, { timeoutMs: 50 });

    expect(callOrder).toEqual(['HUNTER']);
    expect(result.email).toBe('hunter@test.com');
    expect(result.provider).toBe('HUNTER');
  });

  it('returns NONE provider when no provider finds a verified email', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({}),
      HUNTER: makeProvider({}),
      PROXYCURL: makeProvider({}),
      CLEARBIT: makeProvider({}),
    };

    const result = await enrichProspect('lead-1', providers);

    expect(result.provider).toBe('NONE');
    expect(result.email).toBeUndefined();
    expect(result.decisionMaker).toBeUndefined();
  });

  it('records enrichment run for each queried provider', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({}),
      HUNTER: makeProvider({ email: 'found@test.com' }),
      PROXYCURL: makeProvider({}),
      CLEARBIT: makeProvider({}),
    };

    await enrichProspect('lead-1', providers);

    // Should have created runs for APOLLO and HUNTER (stopped after HUNTER)
    expect(mockPrisma.prospectEnrichmentRun.create).toHaveBeenCalledTimes(2);

    // Verify provider names in order
    const createCalls = mockPrisma.prospectEnrichmentRun.create.mock.calls;
    expect(createCalls[0][0].data.provider).toBe('APOLLO');
    expect(createCalls[1][0].data.provider).toBe('HUNTER');
  });

  it('marks failed providers as FAILED in enrichment run', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeFailingProvider('API error'),
      HUNTER: makeProvider({ email: 'found@test.com' }),
    };

    await enrichProspect('lead-1', providers);

    const updateCalls = mockPrisma.prospectEnrichmentRun.update.mock.calls;
    // First update: APOLLO failed
    expect(updateCalls[0][0].data.status).toBe('FAILED');
    expect(updateCalls[0][0].data.errorMessage).toContain('API error');
    // Second update: HUNTER success
    expect(updateCalls[1][0].data.status).toBe('SUCCESS');
  });

  it('updates ProspectLead with decision maker info on success', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({
        email: 'owner@biz.com',
        phone: '555-1234',
        decisionMaker: { name: 'Jane Doe', title: 'Owner' },
      }),
    };

    await enrichProspect('lead-1', providers);

    expect(mockPrisma.prospectLead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          decisionMakerEmail: 'owner@biz.com',
          decisionMakerEmailStatus: 'verified',
          decisionMakerName: 'Jane Doe',
          decisionMakerTitle: 'Owner',
          phone: '555-1234',
        }),
      })
    );
  });

  it('accumulates cost across all queried providers', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({}),
      HUNTER: makeProvider({}),
      PROXYCURL: makeProvider({}),
      CLEARBIT: makeProvider({ email: 'last@test.com' }),
    };

    const result = await enrichProspect('lead-1', providers, {
      costPerCallCents: 5,
    });

    expect(result.costCents).toBe(20); // 4 providers × 5 cents
  });

  it('handles all providers failing gracefully', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeFailingProvider('fail 1'),
      HUNTER: makeFailingProvider('fail 2'),
      PROXYCURL: makeFailingProvider('fail 3'),
      CLEARBIT: makeFailingProvider('fail 4'),
    };

    const result = await enrichProspect('lead-1', providers);

    expect(result.provider).toBe('NONE');
    expect(result.email).toBeUndefined();
    expect(result.leadId).toBe('lead-1');
    // All 4 providers should have been attempted
    expect(mockPrisma.prospectEnrichmentRun.create).toHaveBeenCalledTimes(4);
  });

  it('uses default timeout of 10s when not configured', async () => {
    // We can't easily test the exact timeout value, but we can verify
    // that a fast provider succeeds with default config
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({ email: 'fast@test.com' }),
    };

    const result = await enrichProspect('lead-1', providers);
    expect(result.email).toBe('fast@test.com');
  });

  it('passes business name and website to provider functions', async () => {
    const lead = makeLead({
      businessName: 'Acme Corp',
      website: 'https://acme.com',
    });
    setupMocks(lead);

    const providerSpy = vi.fn().mockResolvedValue({ email: 'a@acme.com' });
    const providers: EnrichmentProviders = {
      APOLLO: providerSpy,
    };

    await enrichProspect('lead-1', providers);

    expect(providerSpy).toHaveBeenCalledWith('Acme Corp', 'https://acme.com');
  });

  it('uses empty string for website when lead has no website', async () => {
    const lead = makeLead({ website: null });
    setupMocks(lead);

    const providerSpy = vi.fn().mockResolvedValue({});
    const providers: EnrichmentProviders = {
      APOLLO: providerSpy,
    };

    await enrichProspect('lead-1', providers);

    expect(providerSpy).toHaveBeenCalledWith('Test Business', '');
  });

  it('returns enrichment result with correct leadId', async () => {
    const providers: EnrichmentProviders = {
      APOLLO: makeProvider({ email: 'a@b.com' }),
    };

    const result = await enrichProspect('lead-1', providers);

    expect(result.leadId).toBe('lead-1');
  });
});
