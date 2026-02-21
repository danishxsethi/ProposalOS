/**
 * Unit tests for core types
 */

import {
  LocaleConfig,
  LocaleDetectionResult,
  LocalizedPrompt,
  AnonymizedMetric,
  BenchmarkCohort,
  Pattern,
  RecommendationImplementation,
  EffectivenessRecord,
  IntelligenceResponse,
  RegulatoryFlag,
} from '../types';

describe('Core Types', () => {
  describe('LocaleConfig', () => {
    it('should create a valid locale config', () => {
      const config: LocaleConfig = {
        locale: 'en-US',
        language: 'English (US)',
        primarySearchEngine: 'google',
        currency: 'USD',
        regulations: ['FTC'],
        tone: 'professional',
        benchmarkCohorts: [],
      };

      expect(config.locale).toBe('en-US');
      expect(config.language).toBe('English (US)');
      expect(config.primarySearchEngine).toBe('google');
      expect(config.currency).toBe('USD');
      expect(config.regulations).toContain('FTC');
      expect(config.tone).toBe('professional');
    });
  });

  describe('LocaleDetectionResult', () => {
    it('should create a valid detection result', () => {
      const result: LocaleDetectionResult = {
        detectedLocale: 'de-DE',
        detectionMethod: 'tld',
        confidence: 0.95,
        fallbackChain: ['de-DE', 'en-US'],
      };

      expect(result.detectedLocale).toBe('de-DE');
      expect(result.detectionMethod).toBe('tld');
      expect(result.confidence).toBe(0.95);
      expect(result.fallbackChain).toHaveLength(2);
    });
  });

  describe('LocalizedPrompt', () => {
    it('should create a valid localized prompt', () => {
      const prompt: LocalizedPrompt = {
        nodeId: 'audit-schema-check',
        locale: 'de-DE',
        promptText: 'Überprüfen Sie das Schema...',
        culturalContext: 'German market context',
        thinkingBudget: 4096,
        createdAt: new Date(),
        approvalStatus: 'pending',
      };

      expect(prompt.nodeId).toBe('audit-schema-check');
      expect(prompt.locale).toBe('de-DE');
      expect(prompt.thinkingBudget).toBe(4096);
      expect(prompt.approvalStatus).toBe('pending');
    });
  });

  describe('AnonymizedMetric', () => {
    it('should create a valid anonymized metric', () => {
      const metric: AnonymizedMetric = {
        industry: 'dental',
        businessSize: 'small',
        locale: 'en-US',
        metricType: 'schema_coverage',
        value: 0.75,
        timestamp: new Date(),
      };

      expect(metric.industry).toBe('dental');
      expect(metric.businessSize).toBe('small');
      expect(metric.locale).toBe('en-US');
      expect(metric.value).toBe(0.75);
    });
  });

  describe('BenchmarkCohort', () => {
    it('should create a valid benchmark cohort', () => {
      const cohort: BenchmarkCohort = {
        industry: 'dental',
        businessSize: 'small',
        locale: 'en-US',
        recordCount: 15,
        metrics: new Map(),
        kAnonymity: 15,
        lastUpdated: new Date(),
      };

      expect(cohort.industry).toBe('dental');
      expect(cohort.businessSize).toBe('small');
      expect(cohort.kAnonymity).toBe(15);
      expect(cohort.recordCount).toBe(15);
    });
  });

  describe('Pattern', () => {
    it('should create a valid pattern', () => {
      const pattern: Pattern = {
        description: 'WordPress + Yoast missing FAQ schema',
        affectedPlatforms: ['WordPress'],
        affectedPlugins: ['Yoast'],
        frequency: 25,
        industries: ['dental', 'medical'],
        locales: ['en-US', 'en-GB'],
        recommendedFixes: ['Add FAQ schema markup'],
        confidenceScore: 0.92,
        discoveredAt: new Date(),
        lastObservedAt: new Date(),
        trend: 'stable',
      };

      expect(pattern.description).toContain('WordPress');
      expect(pattern.frequency).toBe(25);
      expect(pattern.confidenceScore).toBe(0.92);
      expect(pattern.trend).toBe('stable');
    });
  });

  describe('RecommendationImplementation', () => {
    it('should create a valid recommendation implementation', () => {
      const impl: RecommendationImplementation = {
        recommendationId: '123e4567-e89b-12d3-a456-426614174000',
        recommendationType: 'schema_markup',
        industry: 'dental',
        locale: 'en-US',
        predictedImpact: {
          trafficChange: 0.15,
          rankingChange: 2.5,
          conversionChange: 0.08,
        },
        implementedAt: new Date(),
      };

      expect(impl.recommendationType).toBe('schema_markup');
      expect(impl.predictedImpact.trafficChange).toBe(0.15);
    });
  });

  describe('EffectivenessRecord', () => {
    it('should create a valid effectiveness record', () => {
      const record: EffectivenessRecord = {
        implementationId: '123e4567-e89b-12d3-a456-426614174000',
        reAuditDate: new Date(),
        actualImpact: {
          trafficChange: 0.12,
          rankingChange: 2.0,
          conversionChange: 0.07,
        },
        accuracy: 0.85,
        confidenceLevel: 0.9,
      };

      expect(record.accuracy).toBe(0.85);
      expect(record.confidenceLevel).toBe(0.9);
      expect(record.actualImpact.trafficChange).toBe(0.12);
    });
  });

  describe('IntelligenceResponse', () => {
    it('should create a valid intelligence response', () => {
      const response: IntelligenceResponse = {
        data: { mean: 0.75, median: 0.78 },
        metadata: {
          sampleSize: 42,
          confidence: 0.95,
          kAnonymity: 15,
          lastUpdated: new Date(),
        },
        privacyNotice: 'This data is anonymized and k-anonymous.',
      };

      expect(response.metadata.sampleSize).toBe(42);
      expect(response.metadata.kAnonymity).toBe(15);
      expect(response.privacyNotice).toContain('anonymized');
    });
  });

  describe('RegulatoryFlag', () => {
    it('should create a valid regulatory flag', () => {
      const flag: RegulatoryFlag = {
        recommendationId: '123e4567-e89b-12d3-a456-426614174000',
        regulation: 'GDPR',
        severity: 'warning',
        message: 'This recommendation may require user consent under GDPR.',
        complianceRequirements: ['Obtain explicit user consent', 'Document consent'],
        suggestedAlternatives: ['Use privacy-preserving analytics'],
      };

      expect(flag.regulation).toBe('GDPR');
      expect(flag.severity).toBe('warning');
      expect(flag.complianceRequirements).toHaveLength(2);
    });
  });
});
