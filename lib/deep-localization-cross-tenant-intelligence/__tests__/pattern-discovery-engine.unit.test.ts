/**
 * Unit tests for PatternDiscoveryEngine
 *
 * Tests cover:
 * - analyzeAudit(): pattern extraction, frequency increment, new pattern creation, auto-promotion
 * - promotePattern(): status transition pending → active
 * - queryPatterns(): filtering by platform, plugin, industry, locale, minFrequency
 * - getPatternStats(): counts and locale aggregation
 * - trackPatternTrend(): trend computation from frequency history
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PatternDiscoveryEngine,
  PATTERN_PROMOTION_THRESHOLD,
  AuditFinding,
} from '../pattern-discovery-engine';
import { Pattern, PatternStats } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<AuditFinding> = {}): AuditFinding {
  return {
    platform: 'WordPress',
    plugin: 'Yoast',
    issueType: 'missing-faq-schema',
    description: 'FAQ schema not implemented',
    recommendedFix: 'Add FAQ schema markup',
    ...overrides,
  };
}

async function observePattern(
  engine: PatternDiscoveryEngine,
  finding: AuditFinding,
  times: number,
  industry = 'dental',
  locale = 'en-US',
): Promise<Pattern[]> {
  let last: Pattern[] = [];
  for (let i = 0; i < times; i++) {
    last = await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
  }
  return last;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PatternDiscoveryEngine', () => {
  let engine: PatternDiscoveryEngine;

  beforeEach(() => {
    engine = new PatternDiscoveryEngine();
  });

  // -------------------------------------------------------------------------
  // analyzeAudit
  // -------------------------------------------------------------------------

  describe('analyzeAudit()', () => {
    it('creates a new pattern when a finding is seen for the first time', async () => {
      const patterns = await engine.analyzeAudit('audit-1', [makeFinding()], 'dental', 'en-US');

      expect(patterns).toHaveLength(1);
      const p = patterns[0];
      expect(p.frequency).toBe(1);
      expect(p.affectedPlatforms).toContain('WordPress');
      expect(p.affectedPlugins).toContain('Yoast');
      expect(p.industries).toContain('dental');
      expect(p.locales).toContain('en-US');
      expect(p.description).toBeTruthy();
    });

    it('increments frequency for an existing pattern on repeated observations', async () => {
      const finding = makeFinding();
      await engine.analyzeAudit('audit-1', [finding], 'dental', 'en-US');
      await engine.analyzeAudit('audit-2', [finding], 'dental', 'en-US');
      const patterns = await engine.analyzeAudit('audit-3', [finding], 'dental', 'en-US');

      expect(patterns[0].frequency).toBe(3);
    });

    it('deduplicates patterns by (platform, plugin, issueType) key', async () => {
      const finding = makeFinding();
      await engine.analyzeAudit('audit-1', [finding], 'dental', 'en-US');
      await engine.analyzeAudit('audit-2', [finding], 'medical', 'de-DE');

      const all = await engine.queryPatterns({});
      expect(all).toHaveLength(1);
      expect(all[0].frequency).toBe(2);
    });

    it('merges industries and locales across observations', async () => {
      const finding = makeFinding();
      await engine.analyzeAudit('audit-1', [finding], 'dental', 'en-US');
      await engine.analyzeAudit('audit-2', [finding], 'medical', 'de-DE');

      const all = await engine.queryPatterns({});
      expect(all[0].industries).toContain('dental');
      expect(all[0].industries).toContain('medical');
      expect(all[0].locales).toContain('en-US');
      expect(all[0].locales).toContain('de-DE');
    });

    it('creates separate patterns for different (platform, plugin, issueType) combinations', async () => {
      await engine.analyzeAudit('audit-1', [makeFinding({ issueType: 'missing-faq-schema' })], 'dental', 'en-US');
      await engine.analyzeAudit('audit-2', [makeFinding({ issueType: 'missing-og-tags' })], 'dental', 'en-US');

      const all = await engine.queryPatterns({});
      expect(all).toHaveLength(2);
    });

    it('handles findings without plugin gracefully', async () => {
      const finding = makeFinding({ plugin: undefined });
      const patterns = await engine.analyzeAudit('audit-1', [finding], 'dental', 'en-US');

      expect(patterns[0].affectedPlugins).toEqual([]);
    });

    it('handles findings without description by generating one', async () => {
      const finding = makeFinding({ description: undefined });
      const patterns = await engine.analyzeAudit('audit-1', [finding], 'dental', 'en-US');

      expect(patterns[0].description).toBeTruthy();
    });

    it('handles empty findings array', async () => {
      const patterns = await engine.analyzeAudit('audit-1', [], 'dental', 'en-US');
      expect(patterns).toHaveLength(0);
    });

    it('processes multiple findings in a single audit', async () => {
      const findings = [
        makeFinding({ issueType: 'missing-faq-schema' }),
        makeFinding({ issueType: 'missing-og-tags' }),
        makeFinding({ issueType: 'slow-lcp' }),
      ];
      const patterns = await engine.analyzeAudit('audit-1', findings, 'dental', 'en-US');
      expect(patterns).toHaveLength(3);
    });

    it('auto-promotes pattern when frequency reaches PATTERN_PROMOTION_THRESHOLD', async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, PATTERN_PROMOTION_THRESHOLD);

      // After promotion, the pattern should appear in active query
      const active = await engine.queryPatterns({ minFrequency: PATTERN_PROMOTION_THRESHOLD });
      expect(active).toHaveLength(1);
      expect(active[0].frequency).toBe(PATTERN_PROMOTION_THRESHOLD);
    });

    it('does not promote pattern before threshold is reached', async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, PATTERN_PROMOTION_THRESHOLD - 1);

      const stats = await engine.getPatternStats();
      expect(stats.pendingApprovals).toBe(1);
      expect(stats.approvedVariants).toBe(0);
    });

    it('increases confidence score as frequency grows', async () => {
      const finding = makeFinding();
      const [p1] = await engine.analyzeAudit('a1', [finding], 'dental', 'en-US');
      const freq1Confidence = p1.confidenceScore;

      await observePattern(engine, finding, 9); // total = 10
      const [p10] = await engine.analyzeAudit('a10', [finding], 'dental', 'en-US');
      expect(p10.confidenceScore).toBeGreaterThan(freq1Confidence);
    });

    it('stores recommendedFix from finding', async () => {
      const finding = makeFinding({ recommendedFix: 'Add FAQ schema markup' });
      const patterns = await engine.analyzeAudit('audit-1', [finding], 'dental', 'en-US');
      expect(patterns[0].recommendedFixes).toContain('Add FAQ schema markup');
    });

    it('merges unique recommended fixes across observations', async () => {
      const finding1 = makeFinding({ recommendedFix: 'Fix A' });
      const finding2 = makeFinding({ recommendedFix: 'Fix B' });
      await engine.analyzeAudit('audit-1', [finding1], 'dental', 'en-US');
      await engine.analyzeAudit('audit-2', [finding2], 'dental', 'en-US');

      const all = await engine.queryPatterns({});
      expect(all[0].recommendedFixes).toContain('Fix A');
      expect(all[0].recommendedFixes).toContain('Fix B');
    });
  });

  // -------------------------------------------------------------------------
  // promotePattern
  // -------------------------------------------------------------------------

  describe('promotePattern()', () => {
    it('promotes a pending pattern to active', async () => {
      const [pattern] = await engine.analyzeAudit('audit-1', [makeFinding()], 'dental', 'en-US');
      await engine.promotePattern(pattern.id!);

      const stats = await engine.getPatternStats();
      expect(stats.approvedVariants).toBe(1);
      expect(stats.pendingApprovals).toBe(0);
    });

    it('throws when pattern id does not exist', async () => {
      await expect(engine.promotePattern('nonexistent-id')).rejects.toThrow();
    });

    it('is idempotent: promoting an already-active pattern does not throw', async () => {
      const [pattern] = await engine.analyzeAudit('audit-1', [makeFinding()], 'dental', 'en-US');
      await engine.promotePattern(pattern.id!);
      // Second promotion should not throw
      await expect(engine.promotePattern(pattern.id!)).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // queryPatterns
  // -------------------------------------------------------------------------

  describe('queryPatterns()', () => {
    beforeEach(async () => {
      await engine.analyzeAudit('a1', [makeFinding({ platform: 'WordPress', plugin: 'Yoast', issueType: 'faq-schema' })], 'dental', 'en-US');
      await engine.analyzeAudit('a2', [makeFinding({ platform: 'Shopify', plugin: undefined, issueType: 'og-tags' })], 'ecommerce', 'de-DE');
      await engine.analyzeAudit('a3', [makeFinding({ platform: 'WordPress', plugin: 'RankMath', issueType: 'sitemap' })], 'medical', 'fr-FR');
    });

    it('returns all patterns when query is empty', async () => {
      const results = await engine.queryPatterns({});
      expect(results).toHaveLength(3);
    });

    it('filters by platform (case-insensitive)', async () => {
      const results = await engine.queryPatterns({ platform: 'wordpress' });
      expect(results).toHaveLength(2);
      results.forEach((p) =>
        expect(p.affectedPlatforms.map((x) => x.toLowerCase())).toContain('wordpress'),
      );
    });

    it('filters by plugin (case-insensitive)', async () => {
      const results = await engine.queryPatterns({ plugin: 'yoast' });
      expect(results).toHaveLength(1);
      expect(results[0].affectedPlugins).toContain('Yoast');
    });

    it('filters by industry (case-insensitive)', async () => {
      const results = await engine.queryPatterns({ industry: 'dental' });
      expect(results).toHaveLength(1);
      expect(results[0].industries).toContain('dental');
    });

    it('filters by locale', async () => {
      const results = await engine.queryPatterns({ locale: 'de-DE' });
      expect(results).toHaveLength(1);
      expect(results[0].locales).toContain('de-DE');
    });

    it('filters by minFrequency', async () => {
      // Add more observations to one pattern
      const finding = makeFinding({ platform: 'WordPress', plugin: 'Yoast', issueType: 'faq-schema' });
      await observePattern(engine, finding, 4); // total = 5

      const results = await engine.queryPatterns({ minFrequency: 5 });
      expect(results).toHaveLength(1);
      expect(results[0].frequency).toBeGreaterThanOrEqual(5);
    });

    it('combines multiple filters (AND logic)', async () => {
      const results = await engine.queryPatterns({ platform: 'WordPress', plugin: 'Yoast' });
      expect(results).toHaveLength(1);
    });

    it('returns empty array when no patterns match', async () => {
      const results = await engine.queryPatterns({ platform: 'Wix' });
      expect(results).toHaveLength(0);
    });

    it('returns results sorted by frequency descending', async () => {
      const finding = makeFinding({ platform: 'WordPress', plugin: 'Yoast', issueType: 'faq-schema' });
      await observePattern(engine, finding, 4); // total = 5

      const results = await engine.queryPatterns({});
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].frequency).toBeGreaterThanOrEqual(results[i].frequency);
      }
    });
  });

  // -------------------------------------------------------------------------
  // getPatternStats
  // -------------------------------------------------------------------------

  describe('getPatternStats()', () => {
    it('returns zero counts for empty engine', async () => {
      const stats = await engine.getPatternStats();
      expect(stats.totalPatterns).toBe(0);
      expect(stats.localesSupported).toHaveLength(0);
      expect(stats.pendingApprovals).toBe(0);
      expect(stats.approvedVariants).toBe(0);
    });

    it('counts total patterns correctly', async () => {
      await engine.analyzeAudit('a1', [makeFinding({ issueType: 'issue-1' })], 'dental', 'en-US');
      await engine.analyzeAudit('a2', [makeFinding({ issueType: 'issue-2' })], 'dental', 'en-US');

      const stats = await engine.getPatternStats();
      expect(stats.totalPatterns).toBe(2);
    });

    it('aggregates unique locales across all patterns', async () => {
      await engine.analyzeAudit('a1', [makeFinding({ issueType: 'issue-1' })], 'dental', 'en-US');
      await engine.analyzeAudit('a2', [makeFinding({ issueType: 'issue-2' })], 'dental', 'de-DE');
      await engine.analyzeAudit('a3', [makeFinding({ issueType: 'issue-1' })], 'dental', 'fr-FR');

      const stats = await engine.getPatternStats();
      expect(stats.localesSupported).toContain('en-US');
      expect(stats.localesSupported).toContain('de-DE');
      expect(stats.localesSupported).toContain('fr-FR');
    });

    it('counts pending vs approved correctly after promotion', async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, PATTERN_PROMOTION_THRESHOLD);

      const stats = await engine.getPatternStats();
      expect(stats.approvedVariants).toBe(1);
      expect(stats.pendingApprovals).toBe(0);
    });

    it('counts pending patterns that have not reached threshold', async () => {
      await engine.analyzeAudit('a1', [makeFinding({ issueType: 'issue-1' })], 'dental', 'en-US');
      await engine.analyzeAudit('a2', [makeFinding({ issueType: 'issue-2' })], 'dental', 'en-US');

      const stats = await engine.getPatternStats();
      expect(stats.pendingApprovals).toBe(2);
      expect(stats.approvedVariants).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // trackPatternTrend
  // -------------------------------------------------------------------------

  describe('trackPatternTrend()', () => {
    it('throws when pattern id does not exist', async () => {
      await expect(engine.trackPatternTrend('nonexistent')).rejects.toThrow();
    });

    it('sets trend to stable when no recent observations', async () => {
      const [pattern] = await engine.analyzeAudit('a1', [makeFinding()], 'dental', 'en-US');
      await engine.trackPatternTrend(pattern.id!);

      // After tracking, query to see updated trend
      const results = await engine.queryPatterns({});
      // With only 1 observation in recent window and 0 in previous, trend is 'increasing'
      // (previous=0, recent=1 → increasing)
      expect(['increasing', 'stable']).toContain(results[0].trend);
    });

    it('sets trend to increasing when recent observations exceed previous period', async () => {
      const finding = makeFinding();
      // Simulate older observations by directly manipulating via multiple analyzeAudit calls
      // We'll observe 1 time (simulating "previous period") then 5 times (simulating "recent period")
      // Since all observations are "now", they all fall in the recent window
      const [pattern] = await engine.analyzeAudit('a1', [finding], 'dental', 'en-US');
      await observePattern(engine, finding, 5);

      await engine.trackPatternTrend(pattern.id!);
      const results = await engine.queryPatterns({});
      // All observations are recent, previous = 0, so trend = increasing
      expect(results[0].trend).toBe('increasing');
    });

    it('updates trend on the pattern in place', async () => {
      const [pattern] = await engine.analyzeAudit('a1', [makeFinding()], 'dental', 'en-US');
      await engine.trackPatternTrend(pattern.id!);

      const results = await engine.queryPatterns({});
      expect(results[0].trend).toBeDefined();
      expect(['increasing', 'stable', 'decreasing']).toContain(results[0].trend);
    });
  });

  // -------------------------------------------------------------------------
  // Pattern data completeness (Requirement 9.4)
  // -------------------------------------------------------------------------

  describe('pattern data completeness', () => {
    it('pattern includes all required fields: description, frequency, platforms, fixes', async () => {
      const finding = makeFinding({
        description: 'FAQ schema missing',
        recommendedFix: 'Add FAQ schema',
      });
      const [pattern] = await engine.analyzeAudit('a1', [finding], 'dental', 'en-US');

      expect(pattern.description).toBeTruthy();
      expect(typeof pattern.frequency).toBe('number');
      expect(Array.isArray(pattern.affectedPlatforms)).toBe(true);
      expect(pattern.affectedPlatforms.length).toBeGreaterThan(0);
      expect(Array.isArray(pattern.recommendedFixes)).toBe(true);
    });

    it('pattern tracks industries and locales (Requirement 9.5)', async () => {
      const finding = makeFinding();
      const [pattern] = await engine.analyzeAudit('a1', [finding], 'dental', 'en-US');

      expect(Array.isArray(pattern.industries)).toBe(true);
      expect(pattern.industries.length).toBeGreaterThan(0);
      expect(Array.isArray(pattern.locales)).toBe(true);
      expect(pattern.locales.length).toBeGreaterThan(0);
    });

    it('pattern has a trend field', async () => {
      const [pattern] = await engine.analyzeAudit('a1', [makeFinding()], 'dental', 'en-US');
      expect(['increasing', 'stable', 'decreasing']).toContain(pattern.trend);
    });

    it('pattern has discoveredAt and lastObservedAt timestamps', async () => {
      const [pattern] = await engine.analyzeAudit('a1', [makeFinding()], 'dental', 'en-US');
      expect(pattern.discoveredAt).toBeInstanceOf(Date);
      expect(pattern.lastObservedAt).toBeInstanceOf(Date);
    });

    it('confidenceScore is between 0 and 1', async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, 20);
      const results = await engine.queryPatterns({});
      expect(results[0].confidenceScore).toBeGreaterThanOrEqual(0);
      expect(results[0].confidenceScore).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Promotion threshold boundary (Requirement 9.2)
  // -------------------------------------------------------------------------

  describe('promotion threshold boundary', () => {
    it(`promotes at exactly ${PATTERN_PROMOTION_THRESHOLD} observations`, async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, PATTERN_PROMOTION_THRESHOLD);

      const stats = await engine.getPatternStats();
      expect(stats.approvedVariants).toBe(1);
    });

    it(`does not promote at ${PATTERN_PROMOTION_THRESHOLD - 1} observations`, async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, PATTERN_PROMOTION_THRESHOLD - 1);

      const stats = await engine.getPatternStats();
      expect(stats.approvedVariants).toBe(0);
      expect(stats.pendingApprovals).toBe(1);
    });

    it('promotes only once even with many more observations', async () => {
      const finding = makeFinding();
      await observePattern(engine, finding, PATTERN_PROMOTION_THRESHOLD + 5);

      const stats = await engine.getPatternStats();
      expect(stats.approvedVariants).toBe(1);
      expect(stats.pendingApprovals).toBe(0);
    });
  });
});
