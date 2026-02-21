/**
 * Unit tests for IntelligenceAPI
 *
 * Tasks: 10.1, 10.3, 10.5, 10.7, 10.9
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.4
 */

import { IntelligenceAPI, RATE_LIMIT_PER_HOUR } from '../intelligence-api';
import { BenchmarkEngine } from '../benchmark-engine';
import { PatternDiscoveryEngine } from '../pattern-discovery-engine';
import { RecommendationEffectivenessTracker } from '../recommendation-effectiveness-tracker';
import { AnonymizedMetric } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAPI() {
  return new IntelligenceAPI(
    new BenchmarkEngine(),
    new PatternDiscoveryEngine(),
    new RecommendationEffectivenessTracker(),
  );
}

function makeMetrics(count: number, overrides: Partial<AnonymizedMetric> = {}): AnonymizedMetric[] {
  return Array.from({ length: count }, (_, i) => ({
    industry: 'dental',
    businessSize: 'small' as const,
    locale: 'en-US',
    metricType: 'score',
    value: 50 + i,
    timestamp: new Date(),
    ...overrides,
  }));
}

// ---------------------------------------------------------------------------
// queryBenchmarks
// ---------------------------------------------------------------------------

describe('queryBenchmarks', () => {
  it('returns a response with correct structure', async () => {
    const benchmarkEngine = new BenchmarkEngine();
    await benchmarkEngine.addMetrics(makeMetrics(10));
    const api = new IntelligenceAPI(benchmarkEngine, new PatternDiscoveryEngine(), new RecommendationEffectivenessTracker());

    const res = await api.queryBenchmarks({ industry: 'dental', locale: 'en-US', size: 'small' }, 'svc-1');

    expect(res).toHaveProperty('data');
    expect(res).toHaveProperty('metadata');
    expect(res).toHaveProperty('privacyNotice');
    expect(typeof res.privacyNotice).toBe('string');
    expect(res.privacyNotice.length).toBeGreaterThan(0);
  });

  it('returns metadata with sampleSize, confidence, kAnonymity, lastUpdated', async () => {
    const benchmarkEngine = new BenchmarkEngine();
    await benchmarkEngine.addMetrics(makeMetrics(10));
    const api = new IntelligenceAPI(benchmarkEngine, new PatternDiscoveryEngine(), new RecommendationEffectivenessTracker());

    const res = await api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-1');

    expect(typeof res.metadata.sampleSize).toBe('number');
    expect(typeof res.metadata.confidence).toBe('number');
    expect(typeof res.metadata.kAnonymity).toBe('number');
    expect(res.metadata.lastUpdated).toBeInstanceOf(Date);
  });

  it('returns sampleSize 0 and empty metrics when no data exists', async () => {
    const api = makeAPI();
    const res = await api.queryBenchmarks({ industry: 'unknown', locale: 'en-US' }, 'svc-1');

    expect(res.metadata.sampleSize).toBe(0);
    expect(res.data.metrics).toEqual({});
  });

  it('throws when industry is missing', async () => {
    const api = makeAPI();
    await expect(api.queryBenchmarks({ industry: '', locale: 'en-US' }, 'svc-1')).rejects.toThrow('industry');
  });

  it('throws when locale is missing', async () => {
    const api = makeAPI();
    await expect(api.queryBenchmarks({ industry: 'dental', locale: '' }, 'svc-1')).rejects.toThrow('locale');
  });

  it('logs the request to the audit log', async () => {
    const api = makeAPI();
    await api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-1');

    const log = api.getAuditLog();
    expect(log.length).toBe(1);
    expect(log[0].queryType).toBe('benchmarks');
    expect(log[0].requesterId).toBe('svc-1');
  });
});

// ---------------------------------------------------------------------------
// queryPatterns
// ---------------------------------------------------------------------------

describe('queryPatterns', () => {
  it('returns a response with correct structure', async () => {
    const api = makeAPI();
    const res = await api.queryPatterns({ platform: 'WordPress' }, 'svc-1');

    expect(res).toHaveProperty('data');
    expect(res).toHaveProperty('metadata');
    expect(res).toHaveProperty('privacyNotice');
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('returns empty data array when no patterns match', async () => {
    const api = makeAPI();
    const res = await api.queryPatterns({ platform: 'NonExistentPlatform' }, 'svc-1');

    expect(res.data).toEqual([]);
    expect(res.metadata.sampleSize).toBe(0);
  });

  it('returns matching patterns when they exist', async () => {
    const patternEngine = new PatternDiscoveryEngine();
    for (let i = 0; i < 10; i++) {
      await patternEngine.analyzeAudit(`audit-${i}`, [
        { platform: 'WordPress', plugin: 'Yoast', issueType: 'missing_schema' },
      ], 'dental', 'en-US');
    }
    const api = new IntelligenceAPI(new BenchmarkEngine(), patternEngine, new RecommendationEffectivenessTracker());

    const res = await api.queryPatterns({ platform: 'WordPress' }, 'svc-1');

    expect(res.data.length).toBeGreaterThan(0);
    expect(res.metadata.sampleSize).toBeGreaterThan(0);
  });

  it('logs the request to the audit log', async () => {
    const api = makeAPI();
    await api.queryPatterns({ platform: 'WordPress' }, 'svc-2');

    const log = api.getAuditLog();
    expect(log.length).toBe(1);
    expect(log[0].queryType).toBe('patterns');
    expect(log[0].requesterId).toBe('svc-2');
  });
});

// ---------------------------------------------------------------------------
// queryEffectiveness
// ---------------------------------------------------------------------------

describe('queryEffectiveness', () => {
  it('returns a response with correct structure', async () => {
    const api = makeAPI();
    const res = await api.queryEffectiveness({ recommendation_type: 'schema_markup' }, 'svc-1');

    expect(res).toHaveProperty('data');
    expect(res).toHaveProperty('metadata');
    expect(res).toHaveProperty('privacyNotice');
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('returns empty data array when no effectiveness data exists', async () => {
    const api = makeAPI();
    const res = await api.queryEffectiveness({ recommendation_type: 'schema_markup', industry: 'dental' }, 'svc-1');

    expect(res.data).toEqual([]);
    expect(res.metadata.sampleSize).toBe(0);
  });

  it('returns effectiveness stats when data exists', async () => {
    const tracker = new RecommendationEffectivenessTracker();
    const implId = await tracker.recordImplementation({
      recommendationId: 'rec-1',
      recommendationType: 'schema_markup',
      industry: 'dental',
      locale: 'en-US',
      predictedImpact: { trafficChange: 10, rankingChange: 2, conversionChange: 5 },
      implementedAt: new Date(),
    });
    await tracker.recordOutcome(implId, {
      reAuditDate: new Date(),
      actualImpact: { trafficChange: 12, rankingChange: 2, conversionChange: 4 },
    });

    const api = new IntelligenceAPI(new BenchmarkEngine(), new PatternDiscoveryEngine(), tracker);
    const res = await api.queryEffectiveness({ recommendation_type: 'schema_markup' }, 'svc-1');

    expect(res.data.length).toBeGreaterThan(0);
    expect(res.metadata.sampleSize).toBeGreaterThan(0);
  });

  it('logs the request to the audit log', async () => {
    const api = makeAPI();
    await api.queryEffectiveness({ recommendation_type: 'schema_markup' }, 'svc-3');

    const log = api.getAuditLog();
    expect(log.length).toBe(1);
    expect(log[0].queryType).toBe('effectiveness');
    expect(log[0].requesterId).toBe('svc-3');
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('rate limiting', () => {
  it('isRateLimited returns false for a new requester', () => {
    const api = makeAPI();
    expect(api.isRateLimited('new-svc')).toBe(false);
  });

  it('isRateLimited returns true after RATE_LIMIT_PER_HOUR requests', async () => {
    const api = makeAPI();
    // Manually fill up the rate limit by making requests
    // We'll use a trick: directly access the private map via any cast
    const rateLimitMap = (api as any).rateLimitMap as Map<string, { timestamps: number[] }>;
    const now = Date.now();
    rateLimitMap.set('svc-limited', {
      timestamps: Array.from({ length: RATE_LIMIT_PER_HOUR }, () => now),
    });

    expect(api.isRateLimited('svc-limited')).toBe(true);
  });

  it('throws when rate limit is exceeded on queryBenchmarks', async () => {
    const api = makeAPI();
    const rateLimitMap = (api as any).rateLimitMap as Map<string, { timestamps: number[] }>;
    const now = Date.now();
    rateLimitMap.set('svc-x', {
      timestamps: Array.from({ length: RATE_LIMIT_PER_HOUR }, () => now),
    });

    await expect(api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-x')).rejects.toThrow('Rate limit exceeded');
  });

  it('throws when rate limit is exceeded on queryPatterns', async () => {
    const api = makeAPI();
    const rateLimitMap = (api as any).rateLimitMap as Map<string, { timestamps: number[] }>;
    const now = Date.now();
    rateLimitMap.set('svc-y', {
      timestamps: Array.from({ length: RATE_LIMIT_PER_HOUR }, () => now),
    });

    await expect(api.queryPatterns({}, 'svc-y')).rejects.toThrow('Rate limit exceeded');
  });

  it('throws when rate limit is exceeded on queryEffectiveness', async () => {
    const api = makeAPI();
    const rateLimitMap = (api as any).rateLimitMap as Map<string, { timestamps: number[] }>;
    const now = Date.now();
    rateLimitMap.set('svc-z', {
      timestamps: Array.from({ length: RATE_LIMIT_PER_HOUR }, () => now),
    });

    await expect(api.queryEffectiveness({}, 'svc-z')).rejects.toThrow('Rate limit exceeded');
  });

  it('rate limits are per-requester (different requesters are independent)', async () => {
    const api = makeAPI();
    const rateLimitMap = (api as any).rateLimitMap as Map<string, { timestamps: number[] }>;
    const now = Date.now();
    rateLimitMap.set('svc-limited', {
      timestamps: Array.from({ length: RATE_LIMIT_PER_HOUR }, () => now),
    });

    // svc-other should not be rate limited
    expect(api.isRateLimited('svc-other')).toBe(false);
    await expect(api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-other')).resolves.toBeDefined();
  });

  it('RATE_LIMIT_PER_HOUR constant is 1000', () => {
    expect(RATE_LIMIT_PER_HOUR).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

describe('audit logging', () => {
  it('logs every request with queryType, requesterId, filters, and timestamp', async () => {
    const api = makeAPI();
    await api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-audit');
    await api.queryPatterns({ platform: 'WordPress' }, 'svc-audit');
    await api.queryEffectiveness({ recommendation_type: 'schema_markup' }, 'svc-audit');

    const log = api.getAuditLog();
    expect(log.length).toBe(3);

    for (const entry of log) {
      expect(entry.queryType).toBeTruthy();
      expect(entry.requesterId).toBe('svc-audit');
      expect(entry.filters).toBeDefined();
      expect(entry.timestamp).toBeInstanceOf(Date);
    }
  });

  it('includes responseSampleSize in audit log entries', async () => {
    const api = makeAPI();
    await api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-1');

    const log = api.getAuditLog();
    expect(typeof log[0].responseSampleSize).toBe('number');
  });

  it('getAuditLog returns a copy (not the internal array)', async () => {
    const api = makeAPI();
    await api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-1');

    const log1 = api.getAuditLog();
    const log2 = api.getAuditLog();
    expect(log1).not.toBe(log2); // different array references
    expect(log1).toEqual(log2);  // same content
  });
});

// ---------------------------------------------------------------------------
// Empty result handling (Requirement 11.7)
// ---------------------------------------------------------------------------

describe('empty result handling', () => {
  it('queryBenchmarks returns empty metrics object (not null/undefined) when no data', async () => {
    const api = makeAPI();
    const res = await api.queryBenchmarks({ industry: 'nonexistent', locale: 'en-US' }, 'svc-1');

    expect(res.data).toBeDefined();
    expect(res.data.metrics).toBeDefined();
    expect(res.metadata.sampleSize).toBe(0);
  });

  it('queryPatterns returns empty array (not null/undefined) when no data', async () => {
    const api = makeAPI();
    const res = await api.queryPatterns({ platform: 'NonExistent' }, 'svc-1');

    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(0);
    expect(res.metadata.sampleSize).toBe(0);
  });

  it('queryEffectiveness returns empty array (not null/undefined) when no data', async () => {
    const api = makeAPI();
    const res = await api.queryEffectiveness({ recommendation_type: 'nonexistent' }, 'svc-1');

    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(0);
    expect(res.metadata.sampleSize).toBe(0);
  });

  it('all empty responses still include privacyNotice', async () => {
    const api = makeAPI();
    const [r1, r2, r3] = await Promise.all([
      api.queryBenchmarks({ industry: 'x', locale: 'en-US' }, 'svc-1'),
      api.queryPatterns({}, 'svc-1'),
      api.queryEffectiveness({}, 'svc-1'),
    ]);

    expect(r1.privacyNotice).toBeTruthy();
    expect(r2.privacyNotice).toBeTruthy();
    expect(r3.privacyNotice).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Privacy (Requirement 11.6)
// ---------------------------------------------------------------------------

const PII_FIELDS = ['clientId', 'clientName', 'domain', 'contactInfo', 'email', 'phone'];

function containsPII(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return PII_FIELDS.some((field) => serialized.includes(`"${field}"`));
}

describe('privacy', () => {
  it('queryBenchmarks response does not contain PII fields', async () => {
    const benchmarkEngine = new BenchmarkEngine();
    await benchmarkEngine.addMetrics(makeMetrics(10));
    const api = new IntelligenceAPI(benchmarkEngine, new PatternDiscoveryEngine(), new RecommendationEffectivenessTracker());

    const res = await api.queryBenchmarks({ industry: 'dental', locale: 'en-US' }, 'svc-1');
    expect(containsPII(res)).toBe(false);
  });

  it('queryPatterns response does not contain PII fields', async () => {
    const api = makeAPI();
    const res = await api.queryPatterns({ platform: 'WordPress' }, 'svc-1');
    expect(containsPII(res)).toBe(false);
  });

  it('queryEffectiveness response does not contain PII fields', async () => {
    const api = makeAPI();
    const res = await api.queryEffectiveness({}, 'svc-1');
    expect(containsPII(res)).toBe(false);
  });
});
