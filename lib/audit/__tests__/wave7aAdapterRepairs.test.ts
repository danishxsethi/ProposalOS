/**
 * Wave 7A (root-cause groups I/H) — hardening of remaining PARTIAL audit modules:
 * dependency reuse (P1-35, P1-38) and GBP identity-match confidence (P1-29).
 *
 * Red-before/green-after: every `it` below documents, in its description, the exact
 * pre-Wave-7A defect it proves is fixed. All provider/browser/LLM calls are mocked —
 * no real network, DNS, browser, or GCS access occurs in this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/modules/seoDeep', () => ({ runSeoDeepModule: vi.fn() }));
vi.mock('@/lib/modules/schemaMarkup', () => ({ runSchemaMarkupModule: vi.fn() }));
vi.mock('@/lib/modules/mobileUX', () => ({ runMobileUXModule: vi.fn() }));
vi.mock('@/lib/modules/gbpDeep', () => ({ runGbpDeepModule: vi.fn() }));
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

import { runGbpDeepModule } from '@/lib/modules/gbpDeep';
import { runMobileUXModule } from '@/lib/modules/mobileUX';
import { runSchemaMarkupModule } from '@/lib/modules/schemaMarkup';
import { runSeoDeepModule } from '@/lib/modules/seoDeep';

import { extractFindingsFromRegistryResult, MODULE_REGISTRY } from '../runner';

class FakeCostTracker {
  addApiCall() {}
}

function adapter(name: string) {
  const entry = MODULE_REGISTRY.find((module) => module.name === name);
  if (!entry) throw new Error(`Missing adapter ${name}`);
  return entry.run;
}

const crawledHomepage = {
  url: 'https://acme.test',
  status: 200,
  title: 'Acme Dental',
  metaDescription: 'Family dentistry',
  h1Count: 1,
  h1Contents: ['Welcome'],
  hasStructuredData: true,
  hasViewportMeta: true,
  internalLinks: 5,
  externalLinks: 2,
  imageCount: 4,
  imagesWithAlt: 2,
};

function websiteCrawlerDependencyData(overrides?: Partial<typeof crawledHomepage>) {
  return {
    findings: [],
    evidenceSnapshots: [
      {
        rawResponse: {
          crawledPages: [{ ...crawledHomepage, ...overrides }],
          html: '<html><body>Acme</body></html>',
        },
      },
    ],
  };
}

describe('P1-35: seoDeep/schemaMarkup adapters reuse the websiteCrawler dependency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seoDeepAdapter forwards the already-crawled homepage instead of leaving the module to fetch it again', async () => {
    vi.mocked(runSeoDeepModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] });
    const tracker = new FakeCostTracker() as never;

    await adapter('seoDeep')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme Dental',
        dependencyResults: { websiteCrawler: websiteCrawlerDependencyData() },
      },
      tracker
    );

    expect(runSeoDeepModule).toHaveBeenCalledWith(
      expect.objectContaining({
        homepageCrawlData: expect.objectContaining({ status: 200, hasViewportMeta: true }),
      }),
      tracker
    );
  });

  it('seoDeepAdapter forwards null when the crawler dependency never captured this homepage (module falls back to its own fetch)', async () => {
    vi.mocked(runSeoDeepModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] });
    const tracker = new FakeCostTracker() as never;

    await adapter('seoDeep')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme Dental',
        dependencyResults: {},
      },
      tracker
    );

    expect(runSeoDeepModule).toHaveBeenCalledWith(
      expect.objectContaining({ homepageCrawlData: null }),
      tracker
    );
  });

  it('schemaMarkupAdapter forwards the already-crawled homepage HTML instead of re-fetching it', async () => {
    vi.mocked(runSchemaMarkupModule).mockResolvedValue({
      moduleId: 'schemaMarkup',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        schemasFound: [],
        schemasExpected: [],
        schemasMissing: [],
        score: 0,
        recommendations: [],
        findings: [],
      },
    });

    await adapter('schemaMarkup')({
      auditId: 'a1',
      tenantId: 't1',
      url: 'https://acme.test',
      businessName: 'Acme Dental',
      dependencyResults: { websiteCrawler: websiteCrawlerDependencyData() },
    });

    expect(runSchemaMarkupModule).toHaveBeenCalledWith(
      expect.objectContaining({ homepageHtml: '<html><body>Acme</body></html>' })
    );
  });
});

describe("P1-38: mobileUX adapter reuses website's mobile PageSpeed score", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards the reused mobile score when website's own PageSpeed call succeeded", async () => {
    vi.mocked(runMobileUXModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] });
    const tracker = new FakeCostTracker() as never;

    await adapter('mobileUX')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
        dependencyResults: {
          website: {
            scores: { performance: 0.42 },
            coreWebVitals: { full: { lcp: { value: 2, rating: 'good' } } },
          },
        },
      },
      tracker
    );

    expect(runMobileUXModule).toHaveBeenCalledWith(
      expect.objectContaining({ reusedMobileScore: 42 }),
      tracker
    );
  });

  it("forwards null (falls back to its own fetch) when website's PageSpeed call did not genuinely succeed", async () => {
    vi.mocked(runMobileUXModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] });
    const tracker = new FakeCostTracker() as never;

    await adapter('mobileUX')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme',
        // website's own PageSpeed failed/missing-key fallback: scores.performance is
        // present but coreWebVitals.full is absent (lib/modules/website.ts's real
        // failure shape) — must never be trusted as a real score.
        dependencyResults: { website: { scores: { performance: 0 }, coreWebVitals: {} } },
      },
      tracker
    );

    expect(runMobileUXModule).toHaveBeenCalledWith(
      expect.objectContaining({ reusedMobileScore: null }),
      tracker
    );
  });
});

describe('P1-29: ambiguous GBP identity match withholds definitive customer-negative findings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('extractFindingsFromRegistryResult emits one advisory finding, not generateGBPFindings output, when identityConfidence is ambiguous', () => {
    const { findings } = extractFindingsFromRegistryResult(
      'gbp',
      {
        status: 'COMPLETE',
        data: {
          placeId: 'place-1',
          identityConfidence: 'ambiguous',
          matchConfidenceScore: 30,
          candidatesConsidered: 3,
          alternateCandidateNames: ['Acme Dental of Springfield', 'Acme Dental Group'],
          // Even though real (would normally trigger PAINKILLER findings), these
          // must not surface while the match is unconfirmed.
          reviews: [],
          photoCount: 0,
        },
      },
      { auditId: 'a1', tenantId: 't1', businessName: 'Acme Dental' }
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Google Business Profile Match Needs Manual Confirmation');
    expect(findings[0].type).not.toBe('PAINKILLER');
    expect(findings.some((f: { title: string }) => /photo|attribute|review/i.test(f.title))).toBe(
      false
    );
  });

  it('extractFindingsFromRegistryResult still generates normal findings when identityConfidence is high', () => {
    const { findings } = extractFindingsFromRegistryResult(
      'gbp',
      {
        status: 'COMPLETE',
        data: {
          placeId: 'place-1',
          identityConfidence: 'high',
          name: 'Acme Dental',
          photoCount: 0,
          reviews: [],
        },
      },
      { auditId: 'a1', tenantId: 't1', businessName: 'Acme Dental' }
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(
      findings.every(
        (f: { title: string }) =>
          f.title !== 'Google Business Profile Match Needs Manual Confirmation'
      )
    ).toBe(true);
  });

  it('gbpDeepAdapter withholds its own findings when the gbp dependency is ambiguous', async () => {
    vi.mocked(runGbpDeepModule).mockResolvedValue({
      findings: [{ title: 'Critical: Business Description Missing' } as never],
      evidenceSnapshots: [],
      execution: { state: 'complete' },
    });
    const tracker = new FakeCostTracker() as never;

    const result = await adapter('gbpDeep')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme Dental',
        city: 'Regina',
        dependencyResults: {
          gbp: { placeId: 'place-1', identityConfidence: 'ambiguous' },
        },
      },
      tracker
    );

    expect(result.status).toBe('PARTIAL');
    expect((result.data as { findings: unknown[] }).findings).toEqual([]);
  });

  it('gbpDeepAdapter forwards real findings unchanged when the gbp dependency is a high-confidence match', async () => {
    vi.mocked(runGbpDeepModule).mockResolvedValue({
      findings: [{ title: 'Critical: Business Description Missing' } as never],
      evidenceSnapshots: [],
      execution: { state: 'complete' },
    });
    const tracker = new FakeCostTracker() as never;

    const result = await adapter('gbpDeep')(
      {
        auditId: 'a1',
        tenantId: 't1',
        url: 'https://acme.test',
        businessName: 'Acme Dental',
        city: 'Regina',
        dependencyResults: {
          gbp: { placeId: 'place-1', identityConfidence: 'high' },
        },
      },
      tracker
    );

    expect(result.status).toBe('COMPLETE');
    expect((result.data as { findings: unknown[] }).findings).toHaveLength(1);
  });
});
