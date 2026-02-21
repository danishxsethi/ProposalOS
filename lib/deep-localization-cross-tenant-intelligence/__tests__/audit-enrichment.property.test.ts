/**
 * Property-based tests for AuditEnrichment.
 *
 * Properties 65–69: Audit Enrichment with Intelligence
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { AuditEnrichment, Finding, AuditResults } from '../audit-enrichment';
import { IntelligenceResponse } from '../types';

// ============================================================================
// Mock IntelligenceAPI
// ============================================================================

class MockIntelligenceAPI {
  callCount = 0;

  async queryBenchmarks(query: any, requesterId: string): Promise<IntelligenceResponse> {
    this.callCount++;
    return {
      data: null,
      metadata: { sampleSize: 0, confidence: 0, kAnonymity: 0, lastUpdated: new Date() },
      privacyNotice: '',
    };
  }

  async queryPatterns(query: any, requesterId: string): Promise<IntelligenceResponse> {
    this.callCount++;
    return {
      data: [],
      metadata: { sampleSize: 0, confidence: 0, kAnonymity: 0, lastUpdated: new Date() },
      privacyNotice: '',
    };
  }

  async queryEffectiveness(query: any, requesterId: string): Promise<IntelligenceResponse> {
    this.callCount++;
    return {
      data: null,
      metadata: { sampleSize: 0, confidence: 0, kAnonymity: 0, lastUpdated: new Date() },
      privacyNotice: '',
    };
  }
}

/** Mock that returns benchmark data for a specific metricType. */
class MockIntelligenceAPIWithBenchmarks extends MockIntelligenceAPI {
  constructor(private metricType: string) {
    super();
  }

  async queryBenchmarks(query: any, requesterId: string): Promise<IntelligenceResponse> {
    this.callCount++;
    return {
      data: {
        industry: query.industry ?? 'dental',
        businessSize: 'small',
        locale: query.locale ?? 'en-US',
        metrics: {
          [this.metricType]: {
            name: this.metricType,
            mean: 50,
            median: 50,
            p25: 25,
            p75: 75,
            p95: 95,
            sampleSize: 20,
          },
        },
      },
      metadata: { sampleSize: 20, confidence: 1, kAnonymity: 10, lastUpdated: new Date() },
      privacyNotice: '',
    };
  }
}

/** Mock that returns pattern data matching a given platform. */
class MockIntelligenceAPIWithPatterns extends MockIntelligenceAPI {
  constructor(private platform: string) {
    super();
  }

  async queryPatterns(query: any, requesterId: string): Promise<IntelligenceResponse> {
    this.callCount++;
    return {
      data: [
        {
          id: 'pattern-1',
          description: 'Known issue with schema markup on ' + this.platform,
          affectedPlatforms: [this.platform],
          affectedPlugins: [],
          frequency: 42,
          industries: ['dental'],
          locales: ['en-US'],
          recommendedFixes: ['Fix schema markup'],
          confidenceScore: 0.9,
          trend: 'stable',
          discoveredAt: new Date(),
          lastObservedAt: new Date(),
        },
      ],
      metadata: { sampleSize: 1, confidence: 0.9, kAnonymity: 0, lastUpdated: new Date() },
      privacyNotice: '',
    };
  }
}

/** Mock that returns effectiveness data for a given recommendation type. */
class MockIntelligenceAPIWithEffectiveness extends MockIntelligenceAPI {
  constructor(private recommendationType: string) {
    super();
  }

  async queryEffectiveness(query: any, requesterId: string): Promise<IntelligenceResponse> {
    this.callCount++;
    return {
      data: [
        {
          recommendationType: this.recommendationType,
          industry: 'dental',
          locale: 'en-US',
          sampleSize: 47,
          averageAccuracy: 0.85,
          averageActualImpact: 0.23,
          confidenceInterval: [0.18, 0.28],
        },
      ],
      metadata: { sampleSize: 47, confidence: 1, kAnonymity: 0, lastUpdated: new Date() },
      privacyNotice: '',
    };
  }
}

// ============================================================================
// Arbitraries
// ============================================================================

const findingArb = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('schema_markup', 'meta_tags', 'page_speed'),
  platform: fc.option(fc.constantFrom('WordPress', 'Shopify'), { nil: undefined }),
  plugin: fc.option(fc.constantFrom('Yoast', 'Rank Math'), { nil: undefined }),
  description: fc.string({ minLength: 5, maxLength: 100 }),
  value: fc.option(fc.float({ min: 0, max: 100, noNaN: true }), { nil: undefined }),
  metricType: fc.option(fc.constantFrom('page_speed', 'schema_coverage'), { nil: undefined }),
});

const localeArb = fc.constantFrom('en-US', 'en-GB', 'de-DE', 'fr-FR');
const industryArb = fc.constantFrom('dental', 'restaurant', 'ecommerce');

// ============================================================================
// Property 65: Audit Enrichment with Benchmarks
// ============================================================================

describe('Property 65: Audit Enrichment with Benchmarks', () => {
  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 65: Audit Enrichment with Benchmarks - Verify Intelligence API queried for every completed audit',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(findingArb, { minLength: 1, maxLength: 5 }),
          localeArb,
          industryArb,
          async (findings, locale, industry) => {
            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const auditResults: AuditResults = { findings, locale, industry };
            await enrichment.enrichAudit(auditResults, locale, industry);

            // The API should have been called at least once (benchmarks, patterns, effectiveness)
            expect(mockAPI.callCount).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 65: Audit Enrichment with Benchmarks - enrichAudit returns EnrichedAuditResults',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(findingArb, { minLength: 1, maxLength: 5 }),
          localeArb,
          industryArb,
          async (findings, locale, industry) => {
            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const auditResults: AuditResults = { findings, locale, industry };
            const result = await enrichment.enrichAudit(auditResults, locale, industry);

            // Result must be an EnrichedAuditResults
            expect(result).toBeDefined();
            expect(result.findings).toHaveLength(findings.length);
            expect(result.locale).toBe(locale);
            expect(result.industry).toBe(industry);
            expect(result.enrichedAt).toBeInstanceOf(Date);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 66: Benchmark Display with Findings
// ============================================================================

describe('Property 66: Benchmark Display with Findings', () => {
  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 66: Benchmark Display with Findings - Verify available benchmarks displayed alongside findings',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom('schema_markup', 'meta_tags', 'page_speed'),
            platform: fc.option(fc.constantFrom('WordPress', 'Shopify'), { nil: undefined }),
            plugin: fc.option(fc.constantFrom('Yoast', 'Rank Math'), { nil: undefined }),
            description: fc.string({ minLength: 5, maxLength: 100 }),
            value: fc.float({ min: 30, max: 80, noNaN: true }),
            metricType: fc.constantFrom('page_speed', 'schema_coverage'),
          }),
          (finding) => {
            const benchmarkData = {
              metrics: {
                [finding.metricType!]: {
                  name: finding.metricType!,
                  mean: 50,
                  median: 50,
                  p25: 25,
                  p75: 75,
                  p95: 95,
                  sampleSize: 20,
                },
              },
            };

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, benchmarkData, [], null);

            // When benchmark data is available for the finding's metricType,
            // benchmarkPercentile should be defined
            expect(enriched.benchmarkPercentile).toBeDefined();
            expect(typeof enriched.benchmarkPercentile).toBe('number');
            expect(enriched.benchmarkPercentile).toBeGreaterThanOrEqual(0);
            expect(enriched.benchmarkPercentile).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 67: Pattern Highlighting in Findings
// ============================================================================

describe('Property 67: Pattern Highlighting in Findings', () => {
  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 67: Pattern Highlighting in Findings - Verify findings matching known patterns are highlighted',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom('WordPress', 'Shopify'),
          fc.string({ minLength: 5, maxLength: 100 }),
          (platform, description) => {
            const finding: Finding = {
              id: 'test-id',
              type: 'schema_markup',
              platform,
              description,
            };

            const patterns = [
              {
                id: 'pattern-1',
                description: 'Known issue with schema markup on ' + platform,
                affectedPlatforms: [platform],
                affectedPlugins: [],
                frequency: 42,
                confidenceScore: 0.9,
              },
            ];

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, null, patterns, null);

            // Finding matches the pattern by platform, so patternMatches should be populated
            expect(enriched.patternMatches).toBeDefined();
            expect(enriched.patternMatches!.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 67: Pattern Highlighting in Findings - patternMatches have required fields',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom('WordPress', 'Shopify'),
          (platform) => {
            const finding: Finding = {
              id: 'test-id',
              type: 'schema_markup',
              platform,
              description: 'some description',
            };

            const patterns = [
              {
                id: 'pattern-1',
                description: 'Known issue on ' + platform,
                affectedPlatforms: [platform],
                affectedPlugins: [],
                frequency: 15,
                confidenceScore: 0.8,
              },
            ];

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, null, patterns, null);

            expect(enriched.patternMatches).toBeDefined();
            for (const match of enriched.patternMatches!) {
              expect(match.patternId).toBeDefined();
              expect(match.description).toBeDefined();
              expect(typeof match.frequency).toBe('number');
              expect(typeof match.confidence).toBe('number');
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 68: Enriched Finding Display Completeness
// ============================================================================

describe('Property 68: Enriched Finding Display Completeness', () => {
  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 68: Enriched Finding Display Completeness - Verify enriched finding has at least one of benchmarkPercentile, patternMatches, effectivenessData when data is available',
    () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.uuid(),
            type: fc.constantFrom('schema_markup', 'meta_tags', 'page_speed'),
            platform: fc.constantFrom('WordPress', 'Shopify'),
            description: fc.string({ minLength: 5, maxLength: 100 }),
            value: fc.float({ min: 30, max: 80, noNaN: true }),
            metricType: fc.constantFrom('page_speed', 'schema_coverage'),
          }),
          (finding) => {
            const benchmarkData = {
              metrics: {
                [finding.metricType!]: {
                  name: finding.metricType!,
                  mean: 50,
                  median: 50,
                  p25: 25,
                  p75: 75,
                  p95: 95,
                  sampleSize: 20,
                },
              },
            };

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, benchmarkData, [], null);

            // When benchmark data is available, at least one enrichment field should be set
            const hasEnrichment =
              enriched.benchmarkPercentile !== undefined ||
              (enriched.patternMatches !== undefined && enriched.patternMatches.length > 0) ||
              enriched.effectivenessData !== undefined;

            expect(hasEnrichment).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 68: Enriched Finding Display Completeness - benchmarkPercentile is a valid percentile value',
    () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 100, noNaN: true }),
          fc.constantFrom('page_speed', 'schema_coverage'),
          (value, metricType) => {
            const finding: Finding = {
              id: 'test-id',
              type: 'schema_markup',
              description: 'test finding',
              value,
              metricType,
            };

            const benchmarkData = {
              metrics: {
                [metricType]: {
                  name: metricType,
                  mean: 50,
                  median: 50,
                  p25: 25,
                  p75: 75,
                  p95: 95,
                  sampleSize: 20,
                },
              },
            };

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, benchmarkData, [], null);

            expect(enriched.benchmarkPercentile).toBeDefined();
            expect(enriched.benchmarkPercentile).toBeGreaterThanOrEqual(0);
            expect(enriched.benchmarkPercentile).toBeLessThanOrEqual(100);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 68: Enriched Finding Display Completeness - effectivenessData shown when available',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom('schema_markup', 'meta_tags', 'page_speed'),
          (type) => {
            const finding: Finding = {
              id: 'test-id',
              type,
              description: 'test finding',
            };

            const effectiveness = [
              {
                recommendationType: type,
                industry: 'dental',
                locale: 'en-US',
                sampleSize: 47,
                averageAccuracy: 0.85,
                averageActualImpact: 0.23,
                confidenceInterval: [0.18, 0.28],
              },
            ];

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, null, [], effectiveness);

            expect(enriched.effectivenessData).toBeDefined();
            expect(enriched.effectivenessData.recommendationType).toBe(type);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ============================================================================
// Property 69: Insufficient Data Messaging
// ============================================================================

describe('Property 69: Insufficient Data Messaging', () => {
  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 69: Insufficient Data Messaging - Verify messaging shown when enrichment data unavailable',
    () => {
      fc.assert(
        fc.property(
          findingArb,
          (finding) => {
            // Strip value and metricType so no benchmark data can match
            const findingWithoutMetric: Finding = {
              ...finding,
              value: undefined,
              metricType: undefined,
              platform: undefined,
              plugin: undefined,
            };

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            // Pass null/empty for all enrichment sources
            const enriched = enrichment.enrichFinding(findingWithoutMetric, null, [], null);

            // When no enrichment data is available, insufficientDataMessage must be set
            expect(enriched.insufficientDataMessage).toBeDefined();
            expect(typeof enriched.insufficientDataMessage).toBe('string');
            expect(enriched.insufficientDataMessage!.length).toBeGreaterThan(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 69: Insufficient Data Messaging - insufficientDataMessage NOT set when enrichment data IS available',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom('WordPress', 'Shopify'),
          (platform) => {
            const finding: Finding = {
              id: 'test-id',
              type: 'schema_markup',
              platform,
              description: 'test finding',
            };

            const patterns = [
              {
                id: 'pattern-1',
                description: 'Known issue on ' + platform,
                affectedPlatforms: [platform],
                affectedPlugins: [],
                frequency: 15,
                confidenceScore: 0.8,
              },
            ];

            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const enriched = enrichment.enrichFinding(finding, null, patterns, null);

            // Pattern matched → has enrichment data → no insufficient message
            expect(enriched.insufficientDataMessage).toBeUndefined();
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'Feature: deep-localization-cross-tenant-intelligence, Property 69: Insufficient Data Messaging - enrichAudit sets insufficientDataMessage on findings with no data',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.uuid(),
              type: fc.constantFrom('schema_markup', 'meta_tags', 'page_speed'),
              description: fc.string({ minLength: 5, maxLength: 100 }),
              // No platform, plugin, value, or metricType → no enrichment possible
            }),
            { minLength: 1, maxLength: 5 },
          ),
          localeArb,
          industryArb,
          async (findings, locale, industry) => {
            const mockAPI = new MockIntelligenceAPI();
            const enrichment = new AuditEnrichment(mockAPI as any);

            const auditResults: AuditResults = { findings, locale, industry };
            const result = await enrichment.enrichAudit(auditResults, locale, industry);

            // All findings should have insufficientDataMessage since mock returns no data
            for (const enrichedFinding of result.findings) {
              expect(enrichedFinding.insufficientDataMessage).toBeDefined();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
