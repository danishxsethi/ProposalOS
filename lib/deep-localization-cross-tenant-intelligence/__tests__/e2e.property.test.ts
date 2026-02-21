/**
 * End-to-End Property-Based Tests
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 18.2: Write end-to-end property tests
 *   - Property Round-Trip: Audit Execution
 *   - Property Round-Trip: Benchmark Collection
 *
 * Requirements: All
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { AnonymizationPipeline } from '../anonymization-pipeline';
import { BenchmarkEngine } from '../benchmark-engine';
import { AuditEnrichment, AuditResults } from '../audit-enrichment';
import { IntelligenceAPI } from '../intelligence-api';
import { PatternDiscoveryEngine } from '../pattern-discovery-engine';
import { RecommendationEffectivenessTracker } from '../recommendation-effectiveness-tracker';
import { AnonymizedMetric, RawAuditMetrics } from '../types';

// ============================================================================
// Arbitraries
// ============================================================================

const localeArb = fc.constantFrom('en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES');
const industryArb = fc.constantFrom('dental', 'restaurant', 'ecommerce', 'legal');
const sizeArb = fc.constantFrom('small', 'medium', 'large');
const metricValueArb = fc.float({ min: 0, max: 100, noNaN: true });

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a RawAuditMetrics object for a given locale/industry/size.
 */
function buildRawAuditMetrics(
  locale: string,
  industry: string,
  businessSize: string,
  metricValue: number,
): RawAuditMetrics {
  return {
    clientId: `client-${locale}-${industry}`,
    clientName: 'Acme Corp',
    domain: 'acme.com',
    contactInfo: 'contact@acme.com',
    auditResults: {
      industry,
      locale,
      businessSize,
      score: metricValue,
      pageSpeed: metricValue * 0.9,
    },
    timestamp: new Date(),
  };
}

/**
 * Build an AnonymizedMetric for the benchmark engine.
 */
function buildAnonymizedMetric(
  industry: string,
  locale: string,
  businessSize: 'small' | 'medium' | 'large',
  metricType: string,
  value: number,
): AnonymizedMetric {
  return {
    industry,
    businessSize,
    locale,
    metricType,
    value,
    timestamp: new Date(),
  };
}

/**
 * Build a minimal IntelligenceAPI with all required dependencies.
 */
function buildIntelligenceAPI(benchmarkEngine: BenchmarkEngine): IntelligenceAPI {
  const patternEngine = new PatternDiscoveryEngine();
  const effectivenessTracker = new RecommendationEffectivenessTracker();
  return new IntelligenceAPI(benchmarkEngine, patternEngine, effectivenessTracker);
}

/**
 * Check that a value contains no PII patterns.
 */
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/, // email
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,                     // phone
];
const PII_FIELD_NAMES = ['clientId', 'clientName', 'domain', 'contactInfo', 'email', 'phone'];

function containsPII(value: unknown): boolean {
  const serialized = JSON.stringify(value, (_key, val) => {
    if (val instanceof Map) return Object.fromEntries(val);
    return val;
  });
  for (const field of PII_FIELD_NAMES) {
    if (serialized.includes(`"${field}"`)) return true;
  }
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(serialized)) return true;
  }
  return false;
}

// ============================================================================
// Property Round-Trip: Audit Execution
//
// For any locale and industry, the complete flow
// (anonymize → add to benchmark → enrich audit) should produce valid
// enriched results with the correct locale, industry, and a valid enrichedAt.
//
// Validates: Requirements All
// ============================================================================

describe('Property Round-Trip: Audit Execution', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Audit Execution
   *
   * For any locale and industry, the complete flow
   * (anonymize → add to benchmark → enrich audit) should produce valid
   * enriched results.
   *
   * Validates: Requirements All
   */
  it('should produce valid enriched results for any locale and industry', async () => {
    await fc.assert(
      fc.asyncProperty(
        localeArb,
        industryArb,
        sizeArb,
        metricValueArb,
        async (locale, industry, size, metricValue) => {
          // Step 1: Anonymize raw audit metrics
          const pipeline = new AnonymizationPipeline();
          const rawMetrics = buildRawAuditMetrics(locale, industry, size, metricValue);
          const anonymized = await pipeline.anonymizeMetrics(rawMetrics);

          // Step 2: Add anonymized metrics to benchmark engine
          // Add 10 metrics to satisfy k-anonymity
          const benchmarkEngine = new BenchmarkEngine();
          const batchMetrics: AnonymizedMetric[] = Array.from({ length: 10 }, (_, i) =>
            buildAnonymizedMetric(
              industry,
              locale,
              size as 'small' | 'medium' | 'large',
              'score',
              metricValue + i,
            ),
          );
          await benchmarkEngine.addMetrics(batchMetrics);

          // Step 3: Enrich audit via Intelligence API
          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const auditEnrichment = new AuditEnrichment(intelligenceAPI);

          const auditResults: AuditResults = {
            findings: [
              {
                id: 'finding-1',
                type: 'seo',
                description: 'Missing meta description',
                value: metricValue,
                metricType: 'score',
              },
            ],
            locale,
            industry,
            businessSize: size,
          };

          const enriched = await auditEnrichment.enrichAudit(auditResults, locale, industry, size);

          // Assertions: enriched results must be valid
          expect(enriched).toBeDefined();
          expect(enriched.locale).toBe(locale);
          expect(enriched.industry).toBe(industry);
          expect(enriched.enrichedAt).toBeInstanceOf(Date);
          expect(isNaN(enriched.enrichedAt.getTime())).toBe(false);
          expect(Array.isArray(enriched.findings)).toBe(true);
          expect(enriched.findings.length).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Audit Execution
   *
   * The enriched results should have the correct locale and industry.
   *
   * Validates: Requirements All
   */
  it('should preserve locale and industry through the complete audit flow', async () => {
    await fc.assert(
      fc.asyncProperty(
        localeArb,
        industryArb,
        sizeArb,
        metricValueArb,
        async (locale, industry, size, metricValue) => {
          const benchmarkEngine = new BenchmarkEngine();
          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const auditEnrichment = new AuditEnrichment(intelligenceAPI);

          const auditResults: AuditResults = {
            findings: [
              {
                id: 'finding-1',
                type: 'performance',
                description: 'Slow page load',
                value: metricValue,
                metricType: 'pageSpeed',
              },
            ],
            locale,
            industry,
            businessSize: size,
          };

          const enriched = await auditEnrichment.enrichAudit(auditResults, locale, industry, size);

          // The locale and industry must be preserved exactly
          expect(enriched.locale).toBe(locale);
          expect(enriched.industry).toBe(industry);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Audit Execution
   *
   * The enrichedAt timestamp should be a valid Date.
   *
   * Validates: Requirements All
   */
  it('should produce a valid enrichedAt timestamp for any audit', async () => {
    await fc.assert(
      fc.asyncProperty(
        localeArb,
        industryArb,
        sizeArb,
        async (locale, industry, size) => {
          const benchmarkEngine = new BenchmarkEngine();
          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const auditEnrichment = new AuditEnrichment(intelligenceAPI);

          const auditResults: AuditResults = {
            findings: [],
            locale,
            industry,
            businessSize: size,
          };

          const before = new Date();
          const enriched = await auditEnrichment.enrichAudit(auditResults, locale, industry, size);
          const after = new Date();

          expect(enriched.enrichedAt).toBeInstanceOf(Date);
          expect(isNaN(enriched.enrichedAt.getTime())).toBe(false);
          // enrichedAt must be within the test execution window
          expect(enriched.enrichedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
          expect(enriched.enrichedAt.getTime()).toBeLessThanOrEqual(after.getTime());
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Audit Execution
   *
   * Anonymization step must remove all PII before metrics enter the benchmark engine.
   *
   * Validates: Requirements 8.1, 8.2, 12.1
   */
  it('should produce anonymized output with no PII after the anonymize step', async () => {
    await fc.assert(
      fc.asyncProperty(
        localeArb,
        industryArb,
        sizeArb,
        metricValueArb,
        async (locale, industry, size, metricValue) => {
          const pipeline = new AnonymizationPipeline();
          const rawMetrics = buildRawAuditMetrics(locale, industry, size, metricValue);
          const anonymized = await pipeline.anonymizeMetrics(rawMetrics);

          // The anonymized output must not contain PII
          expect(containsPII(anonymized)).toBe(false);

          // anonymousId must be a SHA-256 hash (64 hex chars)
          expect(anonymized.anonymousId).toMatch(/^[a-f0-9]{64}$/);

          // Required fields must be present
          expect(anonymized.industry).toBeTruthy();
          expect(anonymized.locale).toBeTruthy();
          expect(anonymized.businessSize).toBeTruthy();
          expect(anonymized.metrics).toBeInstanceOf(Map);
          expect(anonymized.timestamp).toBeInstanceOf(Date);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property Round-Trip: Benchmark Collection
//
// For any batch of 10+ anonymized metrics with the same industry/locale/size,
// they should be queryable via the Intelligence API.
// The query response should have sampleSize >= 10 (k-anonymity).
// The response should not contain any PII.
//
// Validates: Requirements All
// ============================================================================

describe('Property Round-Trip: Benchmark Collection', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Benchmark Collection
   *
   * For any batch of 10+ anonymized metrics with the same industry/locale/size,
   * they should be queryable via the Intelligence API with sampleSize >= 10.
   *
   * Validates: Requirements All
   */
  it('should make metrics queryable via Intelligence API with sampleSize >= 10', async () => {
    await fc.assert(
      fc.asyncProperty(
        industryArb,
        localeArb,
        sizeArb,
        fc.array(metricValueArb, { minLength: 10, maxLength: 10 }),
        async (industry, locale, size, metricValues) => {
          // Build exactly 10 metrics with the same industry/locale/size
          const benchmarkEngine = new BenchmarkEngine();
          const metrics: AnonymizedMetric[] = metricValues.map((value) =>
            buildAnonymizedMetric(
              industry,
              locale,
              size as 'small' | 'medium' | 'large',
              'score',
              value,
            ),
          );
          await benchmarkEngine.addMetrics(metrics);

          // Query via Intelligence API
          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const response = await intelligenceAPI.queryBenchmarks(
            { industry, locale, size },
            'e2e-test-requester',
          );

          // sampleSize must be >= 10 (k-anonymity)
          expect(response.metadata.sampleSize).toBeGreaterThanOrEqual(10);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Benchmark Collection
   *
   * The Intelligence API response should not contain any PII.
   *
   * Validates: Requirements 11.6, 12.1
   */
  it('should return no PII in the Intelligence API benchmark response', async () => {
    await fc.assert(
      fc.asyncProperty(
        industryArb,
        localeArb,
        sizeArb,
        fc.array(metricValueArb, { minLength: 10, maxLength: 10 }),
        async (industry, locale, size, metricValues) => {
          const benchmarkEngine = new BenchmarkEngine();
          const metrics: AnonymizedMetric[] = metricValues.map((value) =>
            buildAnonymizedMetric(
              industry,
              locale,
              size as 'small' | 'medium' | 'large',
              'score',
              value,
            ),
          );
          await benchmarkEngine.addMetrics(metrics);

          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const response = await intelligenceAPI.queryBenchmarks(
            { industry, locale, size },
            'e2e-test-requester',
          );

          // Response must not contain PII
          expect(containsPII(response.data)).toBe(false);
          expect(containsPII(response.metadata)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Benchmark Collection
   *
   * The Intelligence API response must include a privacy notice.
   *
   * Validates: Requirements 11.6
   */
  it('should include a privacy notice in every benchmark response', async () => {
    await fc.assert(
      fc.asyncProperty(
        industryArb,
        localeArb,
        sizeArb,
        fc.array(metricValueArb, { minLength: 10, maxLength: 10 }),
        async (industry, locale, size, metricValues) => {
          const benchmarkEngine = new BenchmarkEngine();
          const metrics: AnonymizedMetric[] = metricValues.map((value) =>
            buildAnonymizedMetric(
              industry,
              locale,
              size as 'small' | 'medium' | 'large',
              'score',
              value,
            ),
          );
          await benchmarkEngine.addMetrics(metrics);

          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const response = await intelligenceAPI.queryBenchmarks(
            { industry, locale, size },
            'e2e-test-requester',
          );

          expect(typeof response.privacyNotice).toBe('string');
          expect(response.privacyNotice.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property Round-Trip: Benchmark Collection
   *
   * All API requests must be logged for compliance review.
   *
   * Validates: Requirements 11.5, 12.4
   */
  it('should log all Intelligence API requests for compliance', async () => {
    await fc.assert(
      fc.asyncProperty(
        industryArb,
        localeArb,
        sizeArb,
        fc.array(metricValueArb, { minLength: 10, maxLength: 10 }),
        async (industry, locale, size, metricValues) => {
          const benchmarkEngine = new BenchmarkEngine();
          const metrics: AnonymizedMetric[] = metricValues.map((value) =>
            buildAnonymizedMetric(
              industry,
              locale,
              size as 'small' | 'medium' | 'large',
              'score',
              value,
            ),
          );
          await benchmarkEngine.addMetrics(metrics);

          const intelligenceAPI = buildIntelligenceAPI(benchmarkEngine);
          const requesterId = `requester-${locale}-${industry}`;

          await intelligenceAPI.queryBenchmarks({ industry, locale, size }, requesterId);

          const auditLog = intelligenceAPI.getAuditLog();
          expect(auditLog.length).toBeGreaterThanOrEqual(1);

          const lastEntry = auditLog[auditLog.length - 1];
          expect(lastEntry.requesterId).toBe(requesterId);
          expect(lastEntry.queryType).toBe('benchmarks');
          expect(lastEntry.timestamp).toBeInstanceOf(Date);
        },
      ),
      { numRuns: 100 },
    );
  });
});
