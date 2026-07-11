/**
 * Wave 5 (root-cause groups E/H) — module adapter, result-shape, dependency-forwarding,
 * aggregation, and failure-state repair. Covers P1-28 (re-verification), P1-33, P1-34,
 * P1-39, P1-43, P2-28, P2-47.
 *
 * Red-before/green-after: every `it` below documents, in its description, the exact
 * pre-Wave-5 defect it proves is fixed. All provider/browser/LLM calls are mocked —
 * no real network, DNS, browser, or GCS access occurs in this file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/modules/gbp', () => ({ runGBPModule: vi.fn() }));
vi.mock('@/lib/modules/competitor', () => ({ runCompetitorModule: vi.fn() }));
vi.mock('@/lib/modules/schemaMarkup', () => ({ runSchemaMarkupModule: vi.fn() }));
vi.mock('@/lib/modules/emailFinder', () => ({ findEmails: vi.fn() }));
vi.mock('@/lib/modules/competitorStrategy', () => ({ runCompetitorStrategyModule: vi.fn() }));
vi.mock('@/lib/modules/videoPresence', () => ({ runVideoModule: vi.fn() }));
vi.mock('@/lib/modules/vision', () => ({ runVisionModule: vi.fn() }));
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

import { findEmails } from '@/lib/modules/emailFinder';
import { runSchemaMarkupModule } from '@/lib/modules/schemaMarkup';
import { runCompetitorStrategyModule } from '@/lib/modules/competitorStrategy';
import { runVideoModule } from '@/lib/modules/videoPresence';

import { deduplicateFindings, MODULE_REGISTRY } from '../runner';

class FakeCostTracker {
  addApiCall() {}
}

function getAdapter(name: string) {
  const mod = MODULE_REGISTRY.find((m) => m.name === name);
  if (!mod) throw new Error(`no such module: ${name}`);
  return mod.run;
}

describe('P1-33: schemaMarkup adapter no longer discards real analysis output', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports COMPLETE and forwards the findings array built from real analysis', async () => {
    vi.mocked(runSchemaMarkupModule).mockResolvedValue({
      moduleId: 'schemaMarkup',
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        schemasFound: [],
        schemasExpected: ['LocalBusiness', 'WebSite'],
        schemasMissing: ['LocalBusiness', 'WebSite'],
        score: 20,
        recommendations: ['Add LocalBusiness schema.'],
        findings: [
          {
            module: 'schemaMarkup',
            category: 'SEO',
            type: 'VITAMIN',
            title: 'Missing LocalBusiness Schema',
            impactScore: 7,
            confidenceScore: 9,
            evidence: [
              {
                pointer: 'https://example.com',
                source: 'schema_markup_analysis',
                collected_at: new Date().toISOString(),
              },
            ],
            metrics: { schemaFingerprint: 'schema-missing:LocalBusiness' },
            effortEstimate: 'LOW',
            recommendedFix: ['Add LocalBusiness schema.'],
          },
        ],
      },
    } as never);

    const adapter = getAdapter('schemaMarkup');
    const result = await adapter(
      { auditId: 'a1', tenantId: 't1', url: 'https://example.com' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect(Array.isArray((result.data as { findings: unknown[] }).findings)).toBe(true);
    expect((result.data as { findings: unknown[] }).findings).toHaveLength(1);
  });

  it('reports FAILED (not COMPLETE) when the module itself reports a real failure — fetch/parse failure is never "missing schema"', async () => {
    vi.mocked(runSchemaMarkupModule).mockResolvedValue({
      moduleId: 'schemaMarkup',
      status: 'failed',
      timestamp: new Date().toISOString(),
      data: null,
      error: 'Schema analysis failed: HTTP 503',
    } as never);

    const adapter = getAdapter('schemaMarkup');
    const result = await adapter(
      { auditId: 'a1', tenantId: 't1', url: 'https://example.com' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('FAILED');
    expect(result.data).toBeNull();
  });
});

describe('P1-39: competitor dependency field-name drift (topCompetitors, not results)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('videoPresence adapter forwards real topCompetitors names, not an empty list from a nonexistent `.results` field', async () => {
    vi.mocked(runVideoModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] } as never);

    const adapter = getAdapter('videoPresence');
    await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        businessName: 'Acme Dental',
        city: 'Springfield',
        dependencyResults: {
          competitor: {
            topCompetitors: [{ name: 'Best Dental Springfield' }, { name: 'Smile Clinic' }],
          },
        },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(runVideoModule).toHaveBeenCalledWith(
      expect.objectContaining({ competitors: ['Best Dental Springfield', 'Smile Clinic'] }),
      expect.anything()
    );
  });

  it('videoPresence adapter does not crash and forwards an empty list when the dependency truly has no competitors', async () => {
    vi.mocked(runVideoModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] } as never);

    const adapter = getAdapter('videoPresence');
    await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        businessName: 'Acme Dental',
        city: 'Springfield',
        dependencyResults: { competitor: { topCompetitors: [] } },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(runVideoModule).toHaveBeenCalledWith(
      expect.objectContaining({ competitors: [] }),
      expect.anything()
    );
  });

  it('competitorStrategy adapter receives a real competitor from topCompetitors instead of being permanently SKIPPED', async () => {
    vi.mocked(runCompetitorStrategyModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
    } as never);

    const adapter = getAdapter('competitorStrategy');
    const result = await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        businessName: 'Acme Dental',
        city: 'Springfield',
        url: 'https://acmedental.com',
        dependencyResults: {
          competitor: {
            topCompetitors: [
              { name: 'Best Dental Springfield', website: 'https://bestdental.com' },
            ],
          },
        },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect(runCompetitorStrategyModule).toHaveBeenCalledWith(
      expect.objectContaining({
        competitorName: 'Best Dental Springfield',
        competitorWebsite: 'https://bestdental.com',
      }),
      expect.anything()
    );
  });
});

describe('P2-47: competitorStrategy self-exclusion is not a naive exact-string match', () => {
  beforeEach(() => vi.clearAllMocks());

  it('excludes a competitor entry that is the subject business under a different case/punctuation, and still finds a real competitor', async () => {
    vi.mocked(runCompetitorStrategyModule).mockResolvedValue({
      findings: [],
      evidenceSnapshots: [],
    } as never);

    const adapter = getAdapter('competitorStrategy');
    const result = await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        businessName: "Joe's Plumbing",
        city: 'Springfield',
        url: 'https://joesplumbing.com',
        dependencyResults: {
          competitor: {
            topCompetitors: [
              { name: 'JOES PLUMBING', website: 'https://joesplumbing.com' }, // self, different casing/punctuation
              { name: 'Best Plumbers Inc', website: 'https://bestplumbers.com' },
            ],
          },
        },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect(runCompetitorStrategyModule).toHaveBeenCalledWith(
      expect.objectContaining({ competitorName: 'Best Plumbers Inc' }),
      expect.anything()
    );
  });

  it('reports SKIPPED (not a false self-match) when every candidate is the subject business itself', async () => {
    const adapter = getAdapter('competitorStrategy');
    const result = await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        businessName: "Joe's Plumbing",
        city: 'Springfield',
        url: 'https://joesplumbing.com',
        dependencyResults: {
          competitor: {
            topCompetitors: [{ name: 'joes plumbing', website: 'https://joesplumbing.com' }],
          },
        },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('SKIPPED');
    expect(runCompetitorStrategyModule).not.toHaveBeenCalled();
  });
});

describe('P2-28: emailFinder adapter distinguishes real failure states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports COMPLETE when emails were found', async () => {
    vi.mocked(findEmails).mockResolvedValue({
      emails: ['contact@acme.com'],
      source: 'website_scrape',
      confidence: 0.8,
    } as never);

    const adapter = getAdapter('emailFinder');
    const result = await adapter(
      { auditId: 'a1', tenantId: 't1', url: 'https://acme.com' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect((result.data as { emails: string[] }).emails).toEqual(['contact@acme.com']);
  });

  it('reports COMPLETE with zero emails on a genuine verified-empty scan (real fetch succeeded, no emails present)', async () => {
    vi.mocked(findEmails).mockResolvedValue({
      emails: [],
      source: 'website_scrape',
      confidence: 0,
    } as never);

    const adapter = getAdapter('emailFinder');
    const result = await adapter(
      { auditId: 'a1', tenantId: 't1', url: 'https://acme.com' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect((result.data as { emails: string[] }).emails).toEqual([]);
  });

  it('reports FAILED (not COMPLETE) when the fetch failed — the previously-dead `status===error` check is replaced by a real signal', async () => {
    vi.mocked(findEmails).mockResolvedValue({
      emails: [],
      source: 'failed',
      confidence: 0,
    } as never);

    const adapter = getAdapter('emailFinder');
    const result = await adapter(
      { auditId: 'a1', tenantId: 't1', url: 'https://acme.com' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('FAILED');
  });

  it('reports FAILED (not COMPLETE) on an unexpected parser/execution exception', async () => {
    vi.mocked(findEmails).mockResolvedValue({
      emails: [],
      source: 'error',
      confidence: 0,
    } as never);

    const adapter = getAdapter('emailFinder');
    const result = await adapter(
      { auditId: 'a1', tenantId: 't1', url: 'https://acme.com' },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('FAILED');
  });
});

describe('P1-43: vision is reachable via the canonical websiteCrawler dependency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports SKIPPED (not COMPLETE) when websiteCrawler produced no screenshot evidence snapshot', async () => {
    const adapter = getAdapter('vision');
    const result = await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        dependencyResults: {
          websiteCrawler: { evidenceSnapshots: [{ source: 'internal_crawl', rawResponse: {} }] },
        },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('SKIPPED');
  });

  it('runs and reports COMPLETE when websiteCrawler forwards a real screenshot evidence snapshot', async () => {
    const { runVisionModule } = await import('@/lib/modules/vision');
    vi.mocked(runVisionModule).mockResolvedValue({ findings: [], evidenceSnapshots: [] } as never);

    const adapter = getAdapter('vision');
    const result = await adapter(
      {
        auditId: 'a1',
        tenantId: 't1',
        businessName: 'Acme Dental',
        dependencyResults: {
          websiteCrawler: {
            evidenceSnapshots: [
              {
                source: 'homepage_screenshot',
                type: 'screenshot',
                name: 'homepage-desktop',
                url: 'https://storage.googleapis.com/bucket/homepage-desktop.png',
                base64: 'ZmFrZS1wbmc=',
                mimeType: 'image/png',
              },
            ],
          },
        },
      },
      new FakeCostTracker() as never,
      undefined
    );

    expect(result.status).toBe('COMPLETE');
    expect(runVisionModule).toHaveBeenCalledWith(
      expect.objectContaining({
        screenshots: expect.arrayContaining([expect.objectContaining({ base64: 'ZmFrZS1wbmc=' })]),
      }),
      expect.anything()
    );
  });
});

describe('P1-34: fingerprint-based finding deduplication', () => {
  it('merges two findings that share the same schemaFingerprint root cause, keeping the higher-impact title and the union of evidence', () => {
    const findings = [
      {
        module: 'schemaAnalysis',
        type: 'PAINKILLER',
        title: 'Missing LocalBusiness/Organization Schema',
        impactScore: 8,
        evidence: [{ pointer: 'https://example.com#a', source: 'schemaAnalysis' }],
        metrics: { schemaFingerprint: 'schema-missing:LocalBusiness' },
      },
      {
        module: 'schemaMarkup',
        type: 'VITAMIN',
        title: 'Missing LocalBusiness Schema',
        impactScore: 7,
        evidence: [{ pointer: 'https://example.com#b', source: 'schemaMarkup' }],
        metrics: { schemaFingerprint: 'schema-missing:LocalBusiness' },
      },
    ];

    const result = deduplicateFindings(findings);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Missing LocalBusiness/Organization Schema'); // higher impactScore wins
    expect(result[0].evidence).toHaveLength(2); // union of evidence preserved, not dropped
  });

  it('keeps two schema findings separate when they have distinct fingerprints (not merged just because both are schema-related)', () => {
    const findings = [
      {
        module: 'schemaAnalysis',
        type: 'VITAMIN',
        title: 'No FAQPage Schema Detected',
        impactScore: 3,
        evidence: [{ pointer: 'https://example.com', source: 'schemaAnalysis' }],
        metrics: {},
      },
      {
        module: 'schemaMarkup',
        type: 'VITAMIN',
        title: 'Missing WebSite Schema',
        impactScore: 4,
        evidence: [{ pointer: 'https://example.com', source: 'schemaMarkup' }],
        metrics: { schemaFingerprint: 'schema-missing:WebSite' },
      },
    ];

    const result = deduplicateFindings(findings);

    expect(result).toHaveLength(2);
  });

  it('is deterministic — same input always merges to the same surviving finding', () => {
    const findings = [
      {
        module: 'a',
        type: 'VITAMIN',
        title: 'X',
        impactScore: 5,
        evidence: [{ pointer: 'p1', source: 'a' }],
        metrics: { fingerprint: 'shared' },
      },
      {
        module: 'b',
        type: 'VITAMIN',
        title: 'Y',
        impactScore: 5,
        evidence: [{ pointer: 'p2', source: 'b' }],
        metrics: { fingerprint: 'shared' },
      },
    ];

    const run1 = deduplicateFindings(findings);
    const run2 = deduplicateFindings(findings);
    expect(run1).toEqual(run2);
  });
});
