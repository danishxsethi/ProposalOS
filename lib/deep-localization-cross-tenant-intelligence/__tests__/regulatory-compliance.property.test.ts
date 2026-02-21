/**
 * Property-based tests for RegulatoryComplianceChecker
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 11.2: Write property tests for Regulatory Compliance Checker
 *   - Property 70: EU Regulatory Compliance Checking
 *   - Property 71: Canada Regulatory Compliance Checking
 *   - Property 72: Australia Regulatory Compliance Checking
 *   - Property 73: Regulatory Concern Flagging and Guidance
 *   - Property 74: Regulatory Requirement Indication
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 15.2, 15.3, 15.4, 15.5
 */

import * as fc from 'fast-check';
import { RegulatoryComplianceChecker } from '../regulatory-compliance-checker';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Recommendation types that trigger regulatory flags. */
const regulatedTypeArb = fc.constantFrom(
  'data_collection',
  'user_tracking',
  'cookie_usage',
  'email_marketing',
  'behavioral_targeting',
);

/** Recommendation types that do NOT trigger regulatory flags. */
const unregulatedTypeArb = fc.constantFrom(
  'schema_markup',
  'page_speed',
  'meta_tags',
  'image_alt',
  'internal_linking',
);

const euLocaleArb = fc.constantFrom('de-DE', 'fr-FR', 'es-ES');

/** Build a recommendation object. */
function makeRec(id: string, type: string, description = 'A recommendation') {
  return { id, type, description };
}

/** Arbitrary for a non-empty array of regulated recommendations. */
const regulatedRecsArb = fc
  .array(
    fc.tuple(fc.uuid(), regulatedTypeArb),
    { minLength: 1, maxLength: 10 },
  )
  .map((pairs) => pairs.map(([id, type]) => makeRec(id, type)));

/** Arbitrary for a mixed array of recommendations (some regulated, some not). */
const mixedRecsArb = fc
  .array(
    fc.tuple(fc.uuid(), fc.oneof(regulatedTypeArb, unregulatedTypeArb)),
    { minLength: 1, maxLength: 10 },
  )
  .map((pairs) => pairs.map(([id, type]) => makeRec(id, type)));

// ---------------------------------------------------------------------------
// Property 70: EU Regulatory Compliance Checking
// Validates: Requirements 15.1
// ---------------------------------------------------------------------------

describe('Property 70: EU Regulatory Compliance Checking', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 70: EU Regulatory Compliance Checking
   *
   * For any audit running in an EU locale, the System SHALL check all recommendations
   * against GDPR requirements.
   *
   * Validates: Requirements 15.1
   */
  it('should flag regulated recommendation types with GDPR for any EU locale', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        euLocaleArb,
        regulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);

          // Must produce at least one flag
          expect(flags.length).toBeGreaterThan(0);

          // Every flag must reference GDPR
          for (const flag of flags) {
            expect(flag.regulation).toBe('GDPR');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 70: EU Regulatory Compliance Checking
   *
   * Unregulated recommendation types must not produce flags for EU locales.
   *
   * Validates: Requirements 15.1
   */
  it('should not flag unregulated recommendation types for EU locales', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        euLocaleArb,
        unregulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);
          expect(flags).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 71: Canada Regulatory Compliance Checking
// Validates: Requirements 15.2
// ---------------------------------------------------------------------------

describe('Property 71: Canada Regulatory Compliance Checking', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 71: Canada Regulatory Compliance Checking
   *
   * For any audit running in Canada (en-CA), the System SHALL check all recommendations
   * against PIPEDA requirements.
   *
   * Validates: Requirements 15.2
   */
  it('should flag regulated recommendation types with PIPEDA for en-CA', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        regulatedTypeArb,
        fc.uuid(),
        async (type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), 'en-CA');

          expect(flags.length).toBeGreaterThan(0);

          for (const flag of flags) {
            expect(flag.regulation).toBe('PIPEDA');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 71: Canada Regulatory Compliance Checking
   *
   * Unregulated recommendation types must not produce flags for en-CA.
   *
   * Validates: Requirements 15.2
   */
  it('should not flag unregulated recommendation types for en-CA', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        unregulatedTypeArb,
        fc.uuid(),
        async (type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), 'en-CA');
          expect(flags).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 72: Australia Regulatory Compliance Checking
// Validates: Requirements 15.3
// ---------------------------------------------------------------------------

describe('Property 72: Australia Regulatory Compliance Checking', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 72: Australia Regulatory Compliance Checking
   *
   * For any audit running in Australia (en-AU), the System SHALL check all recommendations
   * against Privacy Act requirements.
   *
   * Validates: Requirements 15.3
   */
  it('should flag regulated recommendation types with Privacy Act for en-AU', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        regulatedTypeArb,
        fc.uuid(),
        async (type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), 'en-AU');

          expect(flags.length).toBeGreaterThan(0);

          for (const flag of flags) {
            expect(flag.regulation).toBe('Privacy Act');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 72: Australia Regulatory Compliance Checking
   *
   * Unregulated recommendation types must not produce flags for en-AU.
   *
   * Validates: Requirements 15.3
   */
  it('should not flag unregulated recommendation types for en-AU', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        unregulatedTypeArb,
        fc.uuid(),
        async (type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), 'en-AU');
          expect(flags).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 73: Regulatory Concern Flagging and Guidance
// Validates: Requirements 15.4
// ---------------------------------------------------------------------------

describe('Property 73: Regulatory Concern Flagging and Guidance', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 73: Regulatory Concern Flagging and Guidance
   *
   * For any identified regulatory concern, the System SHALL flag the recommendation
   * and provide specific guidance on compliance requirements.
   *
   * Validates: Requirements 15.4
   */
  it('should include non-empty complianceRequirements in every flag', async () => {
    const checker = new RegulatoryComplianceChecker();
    const regulatedLocaleArb = fc.oneof(euLocaleArb, fc.constant('en-CA'), fc.constant('en-AU'));

    await fc.assert(
      fc.asyncProperty(
        regulatedLocaleArb,
        regulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);

          expect(flags.length).toBeGreaterThan(0);

          for (const flag of flags) {
            expect(flag.complianceRequirements.length).toBeGreaterThan(0);
            // Each requirement must be a non-empty string
            for (const req of flag.complianceRequirements) {
              expect(typeof req).toBe('string');
              expect(req.trim().length).toBeGreaterThan(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 73: Regulatory Concern Flagging and Guidance
   *
   * Every flag must include a non-empty message describing the concern.
   *
   * Validates: Requirements 15.4
   */
  it('should include a non-empty message in every flag', async () => {
    const checker = new RegulatoryComplianceChecker();
    const regulatedLocaleArb = fc.oneof(euLocaleArb, fc.constant('en-CA'), fc.constant('en-AU'));

    await fc.assert(
      fc.asyncProperty(
        regulatedLocaleArb,
        regulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);

          for (const flag of flags) {
            expect(typeof flag.message).toBe('string');
            expect(flag.message.trim().length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 73: Regulatory Concern Flagging and Guidance
   *
   * Every flag must include non-empty suggestedAlternatives.
   *
   * Validates: Requirements 15.4
   */
  it('should include non-empty suggestedAlternatives in every flag', async () => {
    const checker = new RegulatoryComplianceChecker();
    const regulatedLocaleArb = fc.oneof(euLocaleArb, fc.constant('en-CA'), fc.constant('en-AU'));

    await fc.assert(
      fc.asyncProperty(
        regulatedLocaleArb,
        regulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);

          for (const flag of flags) {
            expect(flag.suggestedAlternatives.length).toBeGreaterThan(0);
            for (const alt of flag.suggestedAlternatives) {
              expect(typeof alt).toBe('string');
              expect(alt.trim().length).toBeGreaterThan(0);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 74: Regulatory Requirement Indication
// Validates: Requirements 15.5
// ---------------------------------------------------------------------------

describe('Property 74: Regulatory Requirement Indication', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 74: Regulatory Requirement Indication
   *
   * For any flagged recommendation, the System SHALL indicate the specific regulatory
   * requirement that triggered the flag.
   *
   * Validates: Requirements 15.5
   */
  it('should indicate the specific regulation in every flag', async () => {
    const checker = new RegulatoryComplianceChecker();
    const regulatedLocaleArb = fc.oneof(euLocaleArb, fc.constant('en-CA'), fc.constant('en-AU'));

    await fc.assert(
      fc.asyncProperty(
        regulatedLocaleArb,
        regulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);

          expect(flags.length).toBeGreaterThan(0);

          for (const flag of flags) {
            // regulation field must be a known, non-empty string
            expect(typeof flag.regulation).toBe('string');
            expect(flag.regulation.trim().length).toBeGreaterThan(0);
            expect(['GDPR', 'PIPEDA', 'Privacy Act']).toContain(flag.regulation);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 74: Regulatory Requirement Indication
   *
   * The regulation indicated in the flag must match the locale's applicable regulation.
   *
   * Validates: Requirements 15.5
   */
  it('should match the regulation to the locale', async () => {
    const checker = new RegulatoryComplianceChecker();

    await fc.assert(
      fc.asyncProperty(
        regulatedTypeArb,
        fc.uuid(),
        async (type, id) => {
          const euFlags = await checker.checkRecommendation(makeRec(id, type), 'de-DE');
          const caFlags = await checker.checkRecommendation(makeRec(id, type), 'en-CA');
          const auFlags = await checker.checkRecommendation(makeRec(id, type), 'en-AU');

          for (const flag of euFlags) expect(flag.regulation).toBe('GDPR');
          for (const flag of caFlags) expect(flag.regulation).toBe('PIPEDA');
          for (const flag of auFlags) expect(flag.regulation).toBe('Privacy Act');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 74: Regulatory Requirement Indication
   *
   * The recommendationId in every flag must match the input recommendation id.
   *
   * Validates: Requirements 15.5
   */
  it('should preserve the recommendationId in every flag', async () => {
    const checker = new RegulatoryComplianceChecker();
    const regulatedLocaleArb = fc.oneof(euLocaleArb, fc.constant('en-CA'), fc.constant('en-AU'));

    await fc.assert(
      fc.asyncProperty(
        regulatedLocaleArb,
        regulatedTypeArb,
        fc.uuid(),
        async (locale, type, id) => {
          const flags = await checker.checkRecommendation(makeRec(id, type), locale);

          for (const flag of flags) {
            expect(flag.recommendationId).toBe(id);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 74: Regulatory Requirement Indication
   *
   * validateCompliance complianceScore must be in [0, 1] for any input.
   *
   * Validates: Requirements 15.5
   */
  it('should produce a complianceScore in [0, 1] for any recommendations and locale', async () => {
    const checker = new RegulatoryComplianceChecker();
    const anyLocaleArb = fc.constantFrom('de-DE', 'fr-FR', 'es-ES', 'en-CA', 'en-AU', 'en-US', 'en-GB');

    await fc.assert(
      fc.asyncProperty(
        mixedRecsArb,
        anyLocaleArb,
        async (recs, locale) => {
          const report = await checker.validateCompliance(recs, locale);

          expect(report.complianceScore).toBeGreaterThanOrEqual(0);
          expect(report.complianceScore).toBeLessThanOrEqual(1);
          expect(report.totalRecommendations).toBe(recs.length);
          expect(report.flaggedRecommendations).toBeLessThanOrEqual(report.totalRecommendations);
        },
      ),
      { numRuns: 100 },
    );
  });
});
