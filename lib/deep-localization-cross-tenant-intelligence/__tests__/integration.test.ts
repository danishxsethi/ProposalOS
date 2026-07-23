/**
 * Integration tests for the Deep Localization + Cross-Tenant Intelligence pipeline.
 *
 * Tests the interaction between components end-to-end:
 * 1. Anonymization → Benchmark collection flow
 * 2. Multi-locale competitor analysis
 * 3. Privacy monitoring → secure deletion flow
 * 4. Audit enrichment with intelligence data
 * 5. Locale extensibility → deployment flow
 * 6. Regulatory compliance → recommendation flagging
 * 7. Pattern discovery → promotion flow
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { AnonymizationPipeline } from '../anonymization-pipeline';
import { BenchmarkEngine } from '../benchmark-engine';
import { AuditEnrichment } from '../audit-enrichment';
import { CompetitorAnalysisLocalizer } from '../competitor-analysis-localizer';
import { LocaleExtensibilityFramework } from '../locale-extensibility-framework';
import { PrivacyMonitor } from '../privacy-monitor';
import { RegulatoryComplianceChecker } from '../regulatory-compliance-checker';
import { IntelligenceAPI } from '../intelligence-api';
import { PatternDiscoveryEngine } from '../pattern-discovery-engine';
import { RecommendationEffectivenessTracker } from '../recommendation-effectiveness-tracker';
import type { RawAuditMetrics, AnonymizedMetric } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawMetrics(overrides: Partial<RawAuditMetrics> = {}): RawAuditMetrics {
  return {
    clientId: 'client-abc-123',
    clientName: 'Acme Dental',
    domain: 'acme-dental.com',
    contactInfo: 'contact@acme-dental.com',
    auditResults: {
      industry: 'dental',
      locale: 'en-US',
      businessSize: 'small',
      pageSpeedScore: 72,
      seoScore: 65,
    },
    timestamp: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeAnonymizedMetric(overrides: Partial<AnonymizedMetric> = {}): AnonymizedMetric {
  return {
    industry: 'dental',
    businessSize: 'small',
    locale: 'en-US',
    metricType: 'pageSpeedScore',
    value: 72,
    timestamp: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Anonymization → Benchmark collection flow
// ---------------------------------------------------------------------------

describe('Anonymization → Benchmark collection flow', () => {
  let pipeline: AnonymizationPipeline;
  let benchmarkEngine: BenchmarkEngine;

  beforeEach(() => {
    pipeline = new AnonymizationPipeline();
    benchmarkEngine = new BenchmarkEngine();
  });

  it('anonymizes raw metrics and adds them to the benchmark engine, then queries benchmarks', async () => {
    // Create 10 raw metrics (k-anonymity requires >= 10)
    const rawMetricsBatch: RawAuditMetrics[] = Array.from({ length: 10 }, (_, i) =>
      makeRawMetrics({
        clientId: `client-${i}`,
        clientName: `Client ${i}`,
        auditResults: {
          industry: 'dental',
          locale: 'en-US',
          businessSize: 'small',
          pageSpeedScore: 60 + i,
          seoScore: 50 + i,
        },
      }),
    );

    // Anonymize each and collect
    const anonymizedMetrics: AnonymizedMetric[] = [];
    for (const raw of rawMetricsBatch) {
      const anon = await pipeline.anonymizeMetrics(raw);

      // Verify PII is removed
      expect(anon.anonymousId).not.toContain('client-');
      expect(anon.anonymousId).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hash

      // Convert to AnonymizedMetric for benchmark engine
      for (const [metricType, value] of anon.metrics.entries()) {
        anonymizedMetrics.push({
          industry: anon.industry,
          businessSize: anon.businessSize as 'small' | 'medium' | 'large',
          locale: anon.locale,
          metricType,
          value,
          timestamp: anon.timestamp,
        });
      }
    }

    // Add to benchmark engine
    await benchmarkEngine.addMetrics(anonymizedMetrics);

    // Query benchmarks
    const cohort = await benchmarkEngine.queryBenchmarks({
      industry: 'dental',
      locale: 'en-US',
      businessSize: 'small',
    });

    expect(cohort.recordCount).toBeGreaterThanOrEqual(10);
    expect(cohort.kAnonymity).toBeGreaterThanOrEqual(10);
    expect(cohort.industry).toBe('dental');
    expect(cohort.locale).toBe('en-US');
    expect(cohort.metrics.size).toBeGreaterThan(0);
  });

  it('validates anonymized data has no PII', async () => {
    const raw = makeRawMetrics();
    const anon = await pipeline.anonymizeMetrics(raw);
    const validation = await pipeline.validateAnonymization(anon);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('falls back to broader cohort when specific cohort has insufficient data', async () => {
    // Add 10 metrics for dental/en-US (no size specified → goes to * bucket)
    const metrics: AnonymizedMetric[] = Array.from({ length: 10 }, (_, i) =>
      makeAnonymizedMetric({ value: 70 + i }),
    );
    await benchmarkEngine.addMetrics(metrics);

    // Query with a size that has no data — should fall back to broader cohort
    const cohort = await benchmarkEngine.queryBenchmarks({
      industry: 'dental',
      locale: 'en-US',
      businessSize: 'large', // no large records exist
    });

    // Should fall back to industry+locale cohort which has 10 records
    expect(cohort.recordCount).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// 2. Multi-locale competitor analysis
// ---------------------------------------------------------------------------

describe('Multi-locale competitor analysis', () => {
  let localizer: CompetitorAnalysisLocalizer;

  beforeEach(() => {
    localizer = new CompetitorAnalysisLocalizer();
  });

  it('returns separate competitor results for each locale', async () => {
    const locales = ['en-US', 'de-DE', 'fr-FR'];
    const results = await localizer.analyzeMultiLocale(locales, 'dental');

    expect(results.size).toBe(3);
    expect(results.has('en-US')).toBe(true);
    expect(results.has('de-DE')).toBe(true);
    expect(results.has('fr-FR')).toBe(true);
  });

  it('each locale has locale-specific competitors', async () => {
    const results = await localizer.analyzeMultiLocale(['en-US', 'de-DE', 'fr-FR'], 'dental');

    const usCompetitors = results.get('en-US')!;
    const deCompetitors = results.get('de-DE')!;
    const frCompetitors = results.get('fr-FR')!;

    // Each locale should have competitors with the correct locale tag
    expect(usCompetitors.every((c) => c.locale === 'en-US')).toBe(true);
    expect(deCompetitors.every((c) => c.locale === 'de-DE')).toBe(true);
    expect(frCompetitors.every((c) => c.locale === 'fr-FR')).toBe(true);
  });

  it('uses locale-appropriate search engine for each locale', async () => {
    const results = await localizer.analyzeMultiLocale(['en-US', 'de-DE'], 'dental');

    const usCompetitors = results.get('en-US')!;
    const deCompetitors = results.get('de-DE')!;

    // Both use Google (EU uses Google for dental)
    expect(usCompetitors.every((c) => c.searchEngine === 'Google')).toBe(true);
    expect(deCompetitors.every((c) => c.searchEngine === 'Google')).toBe(true);
  });

  it('returns locale-specific metrics for a competitor', async () => {
    const competitors = await localizer.identifyCompetitors('fr-FR', 'dental');
    expect(competitors.length).toBeGreaterThan(0);

    const metrics = await localizer.getLocaleSpecificMetrics(competitors[0], 'fr-FR');

    expect(metrics.locale).toBe('fr-FR');
    expect(metrics.searchEngine).toBeDefined();
    expect(typeof metrics.rankingPosition).toBe('number');
    expect(metrics.searchVisibilityScore).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Privacy monitoring → secure deletion flow
// ---------------------------------------------------------------------------

describe('Privacy monitoring → secure deletion flow', () => {
  let monitor: PrivacyMonitor;

  beforeEach(() => {
    monitor = new PrivacyMonitor();
  });

  it('detects PII in raw data and sends an alert', async () => {
    const dataWithPII = {
      clientName: 'John Smith',
      industry: 'dental',
      pageSpeedScore: 72,
    };

    const result = await monitor.monitorData(dataWithPII);

    expect(result.concern).not.toBeNull();
    expect(result.alertSent).toBe(true);
    expect(result.concern!.type).toBe('pii_detected');
    expect(monitor.getAlerts()).toHaveLength(1);
  });

  it('detects email address as PII', async () => {
    const dataWithEmail = {
      industry: 'dental',
      contactEmail: 'john@example.com',
    };

    const result = await monitor.monitorData(dataWithEmail);

    expect(result.concern).not.toBeNull();
    expect(result.alertSent).toBe(true);
  });

  it('passes clean anonymized data without alerting', async () => {
    const cleanData = {
      industry: 'dental',
      businessSize: 'small',
      locale: 'en-US',
      pageSpeedScore: 72,
    };

    const result = await monitor.monitorData(cleanData);

    expect(result.concern).toBeNull();
    expect(result.alertSent).toBe(false);
  });

  it('securely deletes raw data after anonymization', async () => {
    const rawData = makeRawMetrics();

    const deletion = await monitor.secureDelete(rawData);

    expect(deletion.success).toBe(true);
    expect(deletion.deletedAt).toBeInstanceOf(Date);
    expect(deletion.auditLogEntry).toContain('SECURE_DELETE');
  });

  it('full flow: detect PII → alert → secure delete', async () => {
    const rawData = makeRawMetrics();

    // Monitor detects PII (clientName field)
    const monitorResult = await monitor.monitorData(rawData);
    expect(monitorResult.alertSent).toBe(true);

    // Secure delete the raw data
    const deletion = await monitor.secureDelete(rawData);
    expect(deletion.success).toBe(true);

    // Alert was recorded
    expect(monitor.getAlerts().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Audit enrichment with intelligence data
// ---------------------------------------------------------------------------

describe('Audit enrichment with intelligence data', () => {
  let benchmarkEngine: BenchmarkEngine;
  let patternEngine: PatternDiscoveryEngine;
  let effectivenessTracker: RecommendationEffectivenessTracker;
  let intelligenceAPI: IntelligenceAPI;
  let enrichment: AuditEnrichment;

  beforeEach(async () => {
    benchmarkEngine = new BenchmarkEngine();
    patternEngine = new PatternDiscoveryEngine();
    effectivenessTracker = new RecommendationEffectivenessTracker();
    intelligenceAPI = new IntelligenceAPI(benchmarkEngine, patternEngine, effectivenessTracker);
    enrichment = new AuditEnrichment(intelligenceAPI);

    // Seed benchmark data (10 records for k-anonymity)
    const metrics: AnonymizedMetric[] = Array.from({ length: 10 }, (_, i) =>
      makeAnonymizedMetric({ value: 60 + i * 3 }),
    );
    await benchmarkEngine.addMetrics(metrics);

    // Seed a pattern
    await patternEngine.analyzeAudit(
      'audit-seed',
      [{ platform: 'WordPress', plugin: 'Yoast', issueType: 'missing_schema', description: 'FAQ schema missing' }],
      'dental',
      'en-US',
    );
  });

  it('enriches audit findings with benchmark percentile', async () => {
    const auditResults = {
      findings: [
        {
          id: 'finding-1',
          type: 'performance',
          description: 'Page speed is below average',
          metricType: 'pageSpeedScore',
          value: 65,
        },
      ],
      locale: 'en-US',
      industry: 'dental',
    };

    const enriched = await enrichment.enrichAudit(auditResults, 'en-US', 'dental', 'small');

    expect(enriched.findings).toHaveLength(1);
    expect(enriched.locale).toBe('en-US');
    expect(enriched.industry).toBe('dental');
    expect(enriched.enrichedAt).toBeInstanceOf(Date);
  });

  it('adds insufficient data message when no enrichment data matches', async () => {
    const auditResults = {
      findings: [
        {
          id: 'finding-2',
          type: 'unknown_type',
          description: 'Some obscure finding with no matching data',
        },
      ],
      locale: 'en-US',
      industry: 'dental',
    };

    const enriched = await enrichment.enrichAudit(auditResults, 'en-US', 'dental');

    expect(enriched.findings[0].insufficientDataMessage).toBeDefined();
    expect(enriched.findings[0].insufficientDataMessage).toContain('Enrichment');
  });

  it('matches patterns for WordPress/Yoast findings', async () => {
    const auditResults = {
      findings: [
        {
          id: 'finding-3',
          type: 'schema',
          platform: 'WordPress',
          plugin: 'Yoast',
          description: 'FAQ schema missing on WordPress with Yoast',
        },
      ],
      locale: 'en-US',
      industry: 'dental',
    };

    const enriched = await enrichment.enrichAudit(auditResults, 'en-US', 'dental');
    const finding = enriched.findings[0];

    // Pattern should be matched via platform/plugin
    expect(finding.patternMatches).toBeDefined();
    expect(finding.patternMatches!.length).toBeGreaterThan(0);
  });

  it('includes benchmark metadata in enriched results', async () => {
    const auditResults = {
      findings: [],
      locale: 'en-US',
      industry: 'dental',
    };

    const enriched = await enrichment.enrichAudit(auditResults, 'en-US', 'dental', 'small');

    expect(enriched.benchmarkMetadata).toBeDefined();
    expect(enriched.benchmarkMetadata!.sampleSize).toBeGreaterThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// 5. Locale extensibility → deployment flow
// ---------------------------------------------------------------------------

describe('Locale extensibility → deployment flow', () => {
  let framework: LocaleExtensibilityFramework;

  beforeEach(() => {
    framework = new LocaleExtensibilityFramework();
  });

  it('validates a complete locale config successfully', () => {
    const config = {
      locale: 'ja-JP',
      language: 'Japanese',
      primarySearchEngine: 'google' as const,
      currency: 'JPY',
      regulations: [],
      tone: 'formal' as const,
    };

    const result = framework.validateLocaleConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an incomplete locale config', () => {
    const config = {
      locale: '',
      language: '',
      primarySearchEngine: 'google' as const,
      currency: '',
      regulations: [],
      tone: 'formal' as const,
    };

    const result = framework.validateLocaleConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('deploys a locale and starts benchmark collection', async () => {
    const config = {
      locale: 'ja-JP',
      language: 'Japanese',
      primarySearchEngine: 'google' as const,
      currency: 'JPY',
      regulations: [],
      tone: 'formal' as const,
      nativeSpeakerReviewRequired: true, // required for deployment
    };

    const result = await framework.addLocale(config);

    expect(result.status).toBe('deployed');
    expect(result.benchmarkCollectionStarted).toBe(true);
    expect(framework.getDeployedLocales()).toContain('ja-JP');
    expect(framework.isBenchmarkCollectionStarted('ja-JP')).toBe(true);
  });

  it('returns pending_review when native speaker review is not provided', async () => {
    const config = {
      locale: 'ko-KR',
      language: 'Korean',
      primarySearchEngine: 'naver' as const,
      currency: 'KRW',
      regulations: [],
      tone: 'formal' as const,
      // nativeSpeakerReviewRequired not set → pending review
    };

    const result = await framework.addLocale(config);

    expect(result.status).toBe('pending_review');
    expect(result.benchmarkCollectionStarted).toBe(false);
  });

  it('full flow: add locale → verify deployment → verify benchmark collection', async () => {
    const config = {
      locale: 'pt-BR',
      language: 'Portuguese',
      primarySearchEngine: 'google' as const,
      currency: 'BRL',
      regulations: ['LGPD'],
      tone: 'professional' as const,
      nativeSpeakerReviewRequired: true,
    };

    const deployResult = await framework.addLocale(config);
    expect(deployResult.status).toBe('deployed');

    const deployedLocales = framework.getDeployedLocales();
    expect(deployedLocales).toContain('pt-BR');

    expect(framework.isBenchmarkCollectionStarted('pt-BR')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Regulatory compliance → recommendation flagging
// ---------------------------------------------------------------------------

describe('Regulatory compliance → recommendation flagging', () => {
  let checker: RegulatoryComplianceChecker;

  beforeEach(() => {
    checker = new RegulatoryComplianceChecker();
  });

  it('flags GDPR concerns for EU locale (de-DE)', async () => {
    const recommendation = {
      id: 'rec-1',
      type: 'data_collection',
      description: 'Add user tracking to improve personalization',
    };

    const flags = await checker.checkRecommendation(recommendation, 'de-DE');

    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].regulation).toBe('GDPR');
    expect(flags[0].message).toContain('GDPR');
    expect(flags[0].complianceRequirements.length).toBeGreaterThan(0);
  });

  it('flags GDPR concerns for fr-FR and es-ES', async () => {
    const recommendation = {
      id: 'rec-2',
      type: 'cookie_usage',
      description: 'Implement cookie-based tracking',
    };

    const frFlags = await checker.checkRecommendation(recommendation, 'fr-FR');
    const esFlags = await checker.checkRecommendation(recommendation, 'es-ES');

    expect(frFlags.some((f) => f.regulation === 'GDPR')).toBe(true);
    expect(esFlags.some((f) => f.regulation === 'GDPR')).toBe(true);
  });

  it('flags PIPEDA concerns for en-CA', async () => {
    const recommendation = {
      id: 'rec-3',
      type: 'email_marketing',
      description: 'Send promotional emails to all users',
    };

    const flags = await checker.checkRecommendation(recommendation, 'en-CA');

    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].regulation).toBe('PIPEDA');
  });

  it('flags Privacy Act concerns for en-AU', async () => {
    const recommendation = {
      id: 'rec-4',
      type: 'behavioral_targeting',
      description: 'Use behavioral targeting for ads',
    };

    const flags = await checker.checkRecommendation(recommendation, 'en-AU');

    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].regulation).toBe('Privacy Act');
  });

  it('does not flag non-regulated recommendation types', async () => {
    const recommendation = {
      id: 'rec-5',
      type: 'schema_markup',
      description: 'Add FAQ schema markup',
    };

    const flags = await checker.checkRecommendation(recommendation, 'de-DE');
    expect(flags).toHaveLength(0);
  });

  it('generates full compliance report for EU locale', async () => {
    const recommendations = [
      { id: 'r1', type: 'data_collection', description: 'Collect user data' },
      { id: 'r2', type: 'schema_markup', description: 'Add schema markup' },
      { id: 'r3', type: 'cookie_usage', description: 'Use cookies' },
    ];

    const report = await checker.validateCompliance(recommendations, 'de-DE');

    expect(report.locale).toBe('de-DE');
    expect(report.totalRecommendations).toBe(3);
    expect(report.flaggedRecommendations).toBeGreaterThan(0);
    expect(report.flags.length).toBeGreaterThan(0);
    expect(report.complianceScore).toBeLessThan(1);
  });

  it('returns no flags for en-US (no applicable regulations)', async () => {
    const recommendation = {
      id: 'rec-6',
      type: 'data_collection',
      description: 'Collect user data',
    };

    const flags = await checker.checkRecommendation(recommendation, 'en-US');
    expect(flags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Pattern discovery → promotion flow
// ---------------------------------------------------------------------------

describe('Pattern discovery → promotion flow', () => {
  let patternEngine: PatternDiscoveryEngine;

  beforeEach(() => {
    patternEngine = new PatternDiscoveryEngine();
  });

  it('discovers a pattern from audit findings', async () => {
    const findings = [
      {
        platform: 'WordPress',
        plugin: 'Yoast',
        issueType: 'missing_faq_schema',
        description: 'FAQ schema is missing',
        recommendedFix: 'Add FAQ schema markup',
      },
    ];

    const patterns = await patternEngine.analyzeAudit('audit-1', findings, 'dental', 'en-US');

    expect(patterns).toHaveLength(1);
    expect(patterns[0].affectedPlatforms).toContain('WordPress');
    expect(patterns[0].frequency).toBe(1);
  });

  it('promotes a pattern when frequency reaches 10', async () => {
    const findings = [
      {
        platform: 'WordPress',
        plugin: 'Yoast',
        issueType: 'missing_faq_schema',
        description: 'FAQ schema is missing',
      },
    ];

    // Run 10 audits with the same pattern
    for (let i = 0; i < 10; i++) {
      await patternEngine.analyzeAudit(`audit-${i}`, findings, 'dental', 'en-US');
    }

    // Query active patterns (promoted ones)
    const stats = await patternEngine.getPatternStats();
    expect(stats.approvedVariants).toBeGreaterThan(0);

    // The pattern should be queryable
    const patterns = await patternEngine.queryPatterns({ platform: 'WordPress' });
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].frequency).toBe(10);
  });

  it('tracks industries and locales affected by a pattern', async () => {
    const findings = [
      {
        platform: 'WordPress',
        issueType: 'slow_page_speed',
        description: 'Page speed is slow',
      },
    ];

    await patternEngine.analyzeAudit('audit-a', findings, 'dental', 'en-US');
    await patternEngine.analyzeAudit('audit-b', findings, 'restaurant', 'de-DE');

    const patterns = await patternEngine.queryPatterns({ platform: 'WordPress' });
    expect(patterns.length).toBeGreaterThan(0);

    const pattern = patterns[0];
    expect(pattern.industries).toContain('dental');
    expect(pattern.industries).toContain('restaurant');
    expect(pattern.locales).toContain('en-US');
    expect(pattern.locales).toContain('de-DE');
  });

  it('does not promote a pattern with fewer than 10 observations', async () => {
    const findings = [
      {
        platform: 'Shopify',
        issueType: 'missing_product_schema',
        description: 'Product schema missing',
      },
    ];

    // Only 5 audits — below threshold
    for (let i = 0; i < 5; i++) {
      await patternEngine.analyzeAudit(`audit-${i}`, findings, 'ecommerce', 'en-US');
    }

    const stats = await patternEngine.getPatternStats();
    expect(stats.pendingApprovals).toBeGreaterThan(0);
    expect(stats.approvedVariants).toBe(0);
  });

  it('full flow: multiple audits → pattern promoted → queryable via Intelligence API', async () => {
    const benchmarkEngine = new BenchmarkEngine();
    const effectivenessTracker = new RecommendationEffectivenessTracker();
    const api = new IntelligenceAPI(benchmarkEngine, patternEngine, effectivenessTracker);

    const findings = [
      {
        platform: 'WordPress',
        plugin: 'Yoast',
        issueType: 'missing_faq_schema',
        description: 'FAQ schema missing',
        recommendedFix: 'Add FAQ schema',
      },
    ];

    // Run 10 audits to trigger promotion
    for (let i = 0; i < 10; i++) {
      await patternEngine.analyzeAudit(`audit-${i}`, findings, 'dental', 'en-US');
    }

    // Query via Intelligence API
    const response = await api.queryPatterns(
      { platform: 'WordPress', plugin: 'Yoast' },
      'test-service',
    );

    expect(response.data).toBeInstanceOf(Array);
    expect(response.data.length).toBeGreaterThan(0);
    expect(response.data[0].frequency).toBe(10);
    expect(response.privacyNotice).toBeDefined();

    // Audit log should have the request recorded
    const auditLog = api.getAuditLog();
    expect(auditLog.length).toBeGreaterThan(0);
    expect(auditLog[0].queryType).toBe('patterns');
  });
});
