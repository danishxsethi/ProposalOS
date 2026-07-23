/**
 * Unit tests for RegulatoryComplianceChecker
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { describe, it, expect } from 'vitest';
import { RegulatoryComplianceChecker } from '../regulatory-compliance-checker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRec(overrides: Partial<{ id: string; type: string; description: string }> = {}) {
  return {
    id: 'rec-1',
    type: 'data_collection',
    description: 'Collect user emails for newsletter',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RegulatoryComplianceChecker', () => {
  const checker = new RegulatoryComplianceChecker();

  // -------------------------------------------------------------------------
  // checkRecommendation – EU / GDPR
  // -------------------------------------------------------------------------

  describe('checkRecommendation – GDPR (EU locales)', () => {
    const euLocales = ['de-DE', 'fr-FR', 'es-ES'];

    it.each(euLocales)('should flag data_collection for %s with GDPR', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), locale);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('GDPR');
    });

    it.each(euLocales)('should flag user_tracking for %s with GDPR', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'user_tracking' }), locale);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('GDPR');
    });

    it.each(euLocales)('should flag cookie_usage for %s with GDPR', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'cookie_usage' }), locale);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('GDPR');
    });

    it.each(euLocales)('should flag email_marketing for %s with GDPR', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'email_marketing' }), locale);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('GDPR');
    });

    it.each(euLocales)('should flag behavioral_targeting for %s with GDPR', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'behavioral_targeting' }), locale);
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('GDPR');
    });

    it.each(euLocales)('should not flag schema_markup for %s', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'schema_markup' }), locale);
      expect(flags).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // checkRecommendation – Canada / PIPEDA
  // -------------------------------------------------------------------------

  describe('checkRecommendation – PIPEDA (en-CA)', () => {
    it('should flag data_collection for en-CA with PIPEDA', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'en-CA');
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('PIPEDA');
    });

    it('should flag email_marketing for en-CA with PIPEDA', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'email_marketing' }), 'en-CA');
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('PIPEDA');
    });

    it('should not flag schema_markup for en-CA', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'schema_markup' }), 'en-CA');
      expect(flags).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // checkRecommendation – Australia / Privacy Act
  // -------------------------------------------------------------------------

  describe('checkRecommendation – Privacy Act (en-AU)', () => {
    it('should flag data_collection for en-AU with Privacy Act', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'en-AU');
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('Privacy Act');
    });

    it('should flag behavioral_targeting for en-AU with Privacy Act', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'behavioral_targeting' }), 'en-AU');
      expect(flags.length).toBeGreaterThan(0);
      expect(flags[0].regulation).toBe('Privacy Act');
    });

    it('should not flag schema_markup for en-AU', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'schema_markup' }), 'en-AU');
      expect(flags).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // checkRecommendation – No regulations (en-US, en-GB)
  // -------------------------------------------------------------------------

  describe('checkRecommendation – no regulations (en-US, en-GB)', () => {
    it.each(['en-US', 'en-GB'])('should return no flags for %s', async (locale) => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), locale);
      expect(flags).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Flag structure
  // -------------------------------------------------------------------------

  describe('flag structure', () => {
    it('should include complianceRequirements in every flag', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'de-DE');
      expect(flags[0].complianceRequirements.length).toBeGreaterThan(0);
    });

    it('should include suggestedAlternatives in every flag', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'de-DE');
      expect(flags[0].suggestedAlternatives.length).toBeGreaterThan(0);
    });

    it('should include the recommendationId in every flag', async () => {
      const flags = await checker.checkRecommendation(makeRec({ id: 'my-rec', type: 'data_collection' }), 'de-DE');
      expect(flags[0].recommendationId).toBe('my-rec');
    });

    it('should include a non-empty message in every flag', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'de-DE');
      expect(flags[0].message.length).toBeGreaterThan(0);
    });

    it('should set severity to warning', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'de-DE');
      expect(flags[0].severity).toBe('warning');
    });
  });

  // -------------------------------------------------------------------------
  // getSuggestedAlternatives
  // -------------------------------------------------------------------------

  describe('getSuggestedAlternatives', () => {
    it('should return the alternatives from the flag', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'de-DE');
      const alternatives = checker.getSuggestedAlternatives(flags[0]);
      expect(alternatives).toEqual(flags[0].suggestedAlternatives);
      expect(alternatives.length).toBeGreaterThan(0);
    });

    it('should return a copy (not the same reference)', async () => {
      const flags = await checker.checkRecommendation(makeRec({ type: 'data_collection' }), 'de-DE');
      const alternatives = checker.getSuggestedAlternatives(flags[0]);
      expect(alternatives).not.toBe(flags[0].suggestedAlternatives);
    });
  });

  // -------------------------------------------------------------------------
  // getApplicableRegulations
  // -------------------------------------------------------------------------

  describe('getApplicableRegulations', () => {
    it('should return GDPR rules for de-DE', async () => {
      const rules = await checker.getApplicableRegulations('de-DE');
      expect(rules.every((r) => r.regulation === 'GDPR')).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return PIPEDA rules for en-CA', async () => {
      const rules = await checker.getApplicableRegulations('en-CA');
      expect(rules.every((r) => r.regulation === 'PIPEDA')).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return Privacy Act rules for en-AU', async () => {
      const rules = await checker.getApplicableRegulations('en-AU');
      expect(rules.every((r) => r.regulation === 'Privacy Act')).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return empty rules for en-US', async () => {
      const rules = await checker.getApplicableRegulations('en-US');
      expect(rules).toHaveLength(0);
    });

    it('should return empty rules for en-GB', async () => {
      const rules = await checker.getApplicableRegulations('en-GB');
      expect(rules).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateCompliance
  // -------------------------------------------------------------------------

  describe('validateCompliance', () => {
    it('should return complianceScore of 1 for empty recommendations', async () => {
      const report = await checker.validateCompliance([], 'de-DE');
      expect(report.complianceScore).toBe(1);
      expect(report.totalRecommendations).toBe(0);
      expect(report.flaggedRecommendations).toBe(0);
      expect(report.flags).toHaveLength(0);
    });

    it('should return complianceScore of 1 when no recommendations are flagged', async () => {
      const recs = [
        makeRec({ id: 'r1', type: 'schema_markup' }),
        makeRec({ id: 'r2', type: 'page_speed' }),
      ];
      const report = await checker.validateCompliance(recs, 'de-DE');
      expect(report.complianceScore).toBe(1);
      expect(report.flaggedRecommendations).toBe(0);
    });

    it('should return complianceScore of 0 when all recommendations are flagged', async () => {
      const recs = [
        makeRec({ id: 'r1', type: 'data_collection' }),
        makeRec({ id: 'r2', type: 'user_tracking' }),
      ];
      const report = await checker.validateCompliance(recs, 'de-DE');
      expect(report.complianceScore).toBe(0);
      expect(report.flaggedRecommendations).toBe(2);
    });

    it('should compute partial complianceScore correctly', async () => {
      const recs = [
        makeRec({ id: 'r1', type: 'data_collection' }), // flagged
        makeRec({ id: 'r2', type: 'schema_markup' }),    // not flagged
      ];
      const report = await checker.validateCompliance(recs, 'de-DE');
      expect(report.complianceScore).toBeCloseTo(0.5);
      expect(report.flaggedRecommendations).toBe(1);
      expect(report.totalRecommendations).toBe(2);
    });

    it('should include the locale in the report', async () => {
      const report = await checker.validateCompliance([], 'fr-FR');
      expect(report.locale).toBe('fr-FR');
    });

    it('should include all flags in the report', async () => {
      const recs = [makeRec({ id: 'r1', type: 'data_collection' })];
      const report = await checker.validateCompliance(recs, 'de-DE');
      expect(report.flags.length).toBeGreaterThan(0);
      expect(report.flags[0].recommendationId).toBe('r1');
    });

    it('should count each flagged recommendation id only once in flaggedRecommendations', async () => {
      // A single recommendation may produce multiple flags (one per rule), but
      // flaggedRecommendations should count unique recommendation IDs.
      const recs = [makeRec({ id: 'r1', type: 'data_collection' })];
      const report = await checker.validateCompliance(recs, 'de-DE');
      expect(report.flaggedRecommendations).toBe(1);
    });
  });
});
