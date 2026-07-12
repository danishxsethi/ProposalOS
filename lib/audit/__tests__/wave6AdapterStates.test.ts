import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/modules/socialDeep', () => ({ runSocialDeepModule: vi.fn() }));
vi.mock('@/lib/modules/gbpDeep', () => ({ runGbpDeepModule: vi.fn() }));
vi.mock('@/lib/modules/mobileUX', () => ({ runMobileUXModule: vi.fn() }));
vi.mock('@/lib/modules/backlinks', () => ({ runBacklinksModule: vi.fn() }));
vi.mock('@/lib/modules/videoPresence', () => ({ runVideoModule: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/cache/redisCache', () => ({ redisCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: vi.fn() }));
vi.mock('@/lib/observability/context', () => ({
  withChildObservabilityContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({ MetricsRecorder: { auditRun: vi.fn() } }));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn(async () => undefined) }));
vi.mock('langsmith', () => ({ RunTree: vi.fn() }));

import { runBacklinksModule } from '@/lib/modules/backlinks';
import { runGbpDeepModule } from '@/lib/modules/gbpDeep';
import { runMobileUXModule } from '@/lib/modules/mobileUX';
import { runSocialDeepModule } from '@/lib/modules/socialDeep';
import { runVideoModule } from '@/lib/modules/videoPresence';

import { MODULE_REGISTRY } from '../runner';

class FakeCostTracker {
  addApiCall() {}
}

function adapter(name: string) {
  const entry = MODULE_REGISTRY.find((module) => module.name === name);
  if (!entry) throw new Error(`Missing adapter ${name}`);
  return entry.run;
}

describe('Wave 6 canonical adapter state mapping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps unavailable and failed module execution honestly', async () => {
    vi.mocked(runSocialDeepModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'unavailable', reason: 'SERP_API_KEY missing' },
    });
    vi.mocked(runMobileUXModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'failed', reason: 'browser failed' },
    });
    vi.mocked(runBacklinksModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'unavailable', reason: 'provider not selected' },
    });

    const tracker = new FakeCostTracker() as never;
    const social = await adapter('socialDeep')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
        city: 'Regina',
        dependencyResults: { social: { skipped: false, discoveredUrls: [] } },
      },
      tracker
    );
    const mobile = await adapter('mobileUX')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
      },
      tracker
    );
    const backlinks = await adapter('backlinks')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
        city: 'Regina',
      },
      tracker
    );

    expect(social.status).toBe('SKIPPED');
    expect(social.error).toMatch(/UNAVAILABLE/);
    expect(mobile.status).toBe('FAILED');
    expect(backlinks.status).toBe('SKIPPED');
  });

  it('maps partial output to PARTIAL and forwards canonical GBP dependency data', async () => {
    vi.mocked(runGbpDeepModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'partial', reason: 'claimed status unavailable' },
    });
    const gbpData = { placeId: 'p1', name: 'Acme', photos: [] };

    const result = await adapter('gbpDeep')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
        city: 'Regina',
        dependencyResults: { gbp: gbpData },
      },
      new FakeCostTracker() as never
    );

    expect(result.status).toBe('PARTIAL');
    expect(runGbpDeepModule).toHaveBeenCalledWith(
      expect.objectContaining({ placeData: gbpData, placeId: 'p1' }),
      expect.anything()
    );
  });

  it('forwards Wave 5 canonical competitor names and preserves partial video state', async () => {
    vi.mocked(runVideoModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
      execution: { state: 'partial', reason: 'metrics unavailable' },
    });

    const result = await adapter('videoPresence')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
        city: 'Regina',
        dependencyResults: {
          competitor: {
            topCompetitors: [{ name: 'Canonical Competitor' }, { title: 'Legacy Shape' }],
          },
        },
      },
      new FakeCostTracker() as never
    );

    expect(result.status).toBe('PARTIAL');
    expect(runVideoModule).toHaveBeenCalledWith(
      expect.objectContaining({ competitors: ['Canonical Competitor'] }),
      expect.anything()
    );
  });
});
