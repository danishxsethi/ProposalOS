/**
 * Property-based tests for PatternDiscoveryEngine
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 8.2: Write property tests for Pattern Discovery
 *   - Property 37: Pattern Analysis Execution
 *   - Property 38: Pattern Promotion Threshold
 *   - Property 39: Active Pattern Usage
 *   - Property 40: Pattern Display Completeness
 *   - Property 41: Pattern Tracking Completeness
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import * as fc from 'fast-check';
import {
  PatternDiscoveryEngine,
  PATTERN_PROMOTION_THRESHOLD,
  AuditFinding,
} from '../pattern-discovery-engine';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const platformArb = fc.constantFrom(
  'WordPress',
  'Shopify',
  'Wix',
  'Squarespace',
  'Drupal',
  'Joomla',
);

const pluginArb = fc.option(
  fc.constantFrom('Yoast', 'RankMath', 'AllInOneSEO', 'SEOPress', 'WooCommerce'),
  { nil: undefined },
);

const issueTypeArb = fc.constantFrom(
  'missing_schema',
  'slow_page_speed',
  'missing_meta_description',
  'broken_links',
  'duplicate_content',
  'missing_alt_text',
);

const industryArb = fc.constantFrom(
  'dental',
  'medical',
  'legal',
  'retail',
  'hospitality',
  'finance',
);

const localeArb = fc.constantFrom(
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
  'de-DE',
  'fr-FR',
  'es-ES',
);

/** Arbitrary for a single AuditFinding with all fields populated. */
const findingArb: fc.Arbitrary<AuditFinding> = fc.record({
  platform: platformArb,
  plugin: pluginArb,
  issueType: issueTypeArb,
  description: fc.string({ minLength: 5, maxLength: 80 }),
  industry: industryArb,
  locale: localeArb,
  recommendedFix: fc.string({ minLength: 5, maxLength: 80 }),
});

/** Arbitrary for a non-empty array of findings (1–10 items). */
const findingsArb = fc.array(findingArb, { minLength: 1, maxLength: 10 });

/** Arbitrary for a non-empty array of findings with at least one unique (platform, plugin, issueType). */
const uniqueFindingsArb = fc
  .array(findingArb, { minLength: 1, maxLength: 8 })
  .filter((findings) => findings.length > 0);

// ---------------------------------------------------------------------------
// Property 37: Pattern Analysis Execution
// Validates: Requirements 9.1
// ---------------------------------------------------------------------------

describe('Property 37: Pattern Analysis Execution', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 37: Pattern Analysis Execution
   *
   * For any completed audit with findings, the Pattern_Library SHALL analyze
   * findings to identify recurring patterns — returning at least one pattern
   * per unique (platform, plugin, issueType) combination.
   *
   * Validates: Requirements 9.1
   */
  it('should return patterns for every unique (platform, plugin, issueType) combination in findings', async () => {
    await fc.assert(
      fc.asyncProperty(uniqueFindingsArb, industryArb, localeArb, async (findings, industry, locale) => {
        const engine = new PatternDiscoveryEngine();

        const patterns = await engine.analyzeAudit('audit-1', findings, industry, locale);

        // Count unique pattern keys in the findings
        const uniqueKeys = new Set(
          findings.map((f) => {
            const platform = (f.platform ?? 'unknown').toLowerCase();
            const plugin = f.plugin ? f.plugin.toLowerCase() : undefined;
            const issueType = (f.issueType ?? 'unknown').toLowerCase();
            return plugin
              ? `${platform}::${plugin}::${issueType}`
              : `${platform}::${issueType}`;
          }),
        );

        // analyzeAudit must return at least one pattern per unique key
        expect(patterns.length).toBeGreaterThanOrEqual(uniqueKeys.size);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 37: Pattern Analysis Execution
   *
   * analyzeAudit() must not throw for any valid findings array.
   *
   * Validates: Requirements 9.1
   */
  it('should not throw for any valid findings array', async () => {
    await fc.assert(
      fc.asyncProperty(findingsArb, industryArb, localeArb, async (findings, industry, locale) => {
        const engine = new PatternDiscoveryEngine();
        await expect(
          engine.analyzeAudit('audit-x', findings, industry, locale),
        ).resolves.not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 37: Pattern Analysis Execution
   *
   * Calling analyzeAudit() multiple times with the same finding must
   * increment the frequency of the corresponding pattern each time.
   *
   * Validates: Requirements 9.1
   */
  it('should increment pattern frequency on each subsequent analyzeAudit() call with the same finding', async () => {
    await fc.assert(
      fc.asyncProperty(
        findingArb,
        industryArb,
        localeArb,
        fc.integer({ min: 2, max: 8 }),
        async (finding, industry, locale, callCount) => {
          const engine = new PatternDiscoveryEngine();

          let lastPatterns = await engine.analyzeAudit('audit-0', [finding], industry, locale);
          const initialFrequency = lastPatterns[0].frequency;

          for (let i = 1; i < callCount; i++) {
            lastPatterns = await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          // Frequency must have grown by (callCount - 1) from the initial value
          expect(lastPatterns[0].frequency).toBe(initialFrequency + (callCount - 1));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 38: Pattern Promotion Threshold
// Validates: Requirements 9.2
// ---------------------------------------------------------------------------

describe('Property 38: Pattern Promotion Threshold', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 38: Pattern Promotion Threshold
   *
   * For any pattern observed in exactly PATTERN_PROMOTION_THRESHOLD (10) audits,
   * the Pattern_Library SHALL promote it to the active library.
   * Patterns observed fewer than 10 times must remain pending.
   *
   * Validates: Requirements 9.2
   */
  it('should promote a pattern exactly when frequency reaches PATTERN_PROMOTION_THRESHOLD', async () => {
    await fc.assert(
      fc.asyncProperty(
        findingArb,
        industryArb,
        localeArb,
        fc.integer({ min: 1, max: PATTERN_PROMOTION_THRESHOLD - 1 }),
        async (finding, industry, locale, belowThresholdCount) => {
          const engine = new PatternDiscoveryEngine();

          // Submit the finding belowThresholdCount times — must stay pending
          for (let i = 0; i < belowThresholdCount; i++) {
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          // Pattern should still be pending (not yet promoted)
          const statsBelow = await engine.getPatternStats();
          expect(statsBelow.pendingApprovals).toBeGreaterThan(0);
          expect(statsBelow.approvedVariants).toBe(0);

          // Submit remaining audits to reach exactly the threshold
          const remaining = PATTERN_PROMOTION_THRESHOLD - belowThresholdCount;
          for (let i = belowThresholdCount; i < belowThresholdCount + remaining; i++) {
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          // Now the pattern must be promoted (active)
          const statsAt = await engine.getPatternStats();
          expect(statsAt.approvedVariants).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 38: Pattern Promotion Threshold
   *
   * For any observation count below PATTERN_PROMOTION_THRESHOLD, the pattern
   * must NOT be promoted.
   *
   * Validates: Requirements 9.2
   */
  it('should NOT promote a pattern when frequency is below PATTERN_PROMOTION_THRESHOLD', async () => {
    await fc.assert(
      fc.asyncProperty(
        findingArb,
        industryArb,
        localeArb,
        fc.integer({ min: 1, max: PATTERN_PROMOTION_THRESHOLD - 1 }),
        async (finding, industry, locale, count) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < count; i++) {
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          const stats = await engine.getPatternStats();
          expect(stats.approvedVariants).toBe(0);
          expect(stats.pendingApprovals).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 38: Pattern Promotion Threshold
   *
   * For any observation count >= PATTERN_PROMOTION_THRESHOLD, the pattern
   * MUST be promoted.
   *
   * Validates: Requirements 9.2
   */
  it('should promote a pattern for any observation count >= PATTERN_PROMOTION_THRESHOLD', async () => {
    await fc.assert(
      fc.asyncProperty(
        findingArb,
        industryArb,
        localeArb,
        fc.integer({ min: PATTERN_PROMOTION_THRESHOLD, max: PATTERN_PROMOTION_THRESHOLD + 10 }),
        async (finding, industry, locale, count) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < count; i++) {
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          const stats = await engine.getPatternStats();
          expect(stats.approvedVariants).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 38: Pattern Promotion Threshold
   *
   * The promotion threshold constant must equal exactly 10.
   *
   * Validates: Requirements 9.2
   */
  it('PATTERN_PROMOTION_THRESHOLD must be exactly 10', () => {
    expect(PATTERN_PROMOTION_THRESHOLD).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Property 39: Active Pattern Usage
// Validates: Requirements 9.3
// ---------------------------------------------------------------------------

describe('Property 39: Active Pattern Usage', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 39: Active Pattern Usage
   *
   * For any active pattern in the library, the System SHALL use it to
   * accelerate diagnosis — i.e., it must be queryable via queryPatterns().
   *
   * Validates: Requirements 9.3
   */
  it('should make promoted patterns queryable via queryPatterns()', async () => {
    await fc.assert(
      fc.asyncProperty(findingArb, industryArb, localeArb, async (finding, industry, locale) => {
        const engine = new PatternDiscoveryEngine();

        // Promote the pattern by reaching the threshold
        for (let i = 0; i < PATTERN_PROMOTION_THRESHOLD; i++) {
          await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
        }

        // Query by platform — the promoted pattern must appear
        const platform = finding.platform ?? 'unknown';
        const results = await engine.queryPatterns({ platform });

        expect(results.length).toBeGreaterThan(0);
        expect(
          results.some((p) =>
            p.affectedPlatforms.some(
              (pl) => pl.toLowerCase() === platform.toLowerCase(),
            ),
          ),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 39: Active Pattern Usage
   *
   * After promotion, queryPatterns() with minFrequency = PATTERN_PROMOTION_THRESHOLD
   * must return the promoted pattern.
   *
   * Validates: Requirements 9.3
   */
  it('should return promoted patterns when queried with minFrequency = PATTERN_PROMOTION_THRESHOLD', async () => {
    await fc.assert(
      fc.asyncProperty(findingArb, industryArb, localeArb, async (finding, industry, locale) => {
        const engine = new PatternDiscoveryEngine();

        for (let i = 0; i < PATTERN_PROMOTION_THRESHOLD; i++) {
          await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
        }

        const results = await engine.queryPatterns({
          minFrequency: PATTERN_PROMOTION_THRESHOLD,
        });

        expect(results.length).toBeGreaterThan(0);
        for (const pattern of results) {
          expect(pattern.frequency).toBeGreaterThanOrEqual(PATTERN_PROMOTION_THRESHOLD);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 39: Active Pattern Usage
   *
   * Patterns that have NOT been promoted (frequency < threshold) must NOT
   * appear when queried with minFrequency = PATTERN_PROMOTION_THRESHOLD.
   *
   * Validates: Requirements 9.3
   */
  it('should not return pending patterns when queried with minFrequency = PATTERN_PROMOTION_THRESHOLD', async () => {
    await fc.assert(
      fc.asyncProperty(
        findingArb,
        industryArb,
        localeArb,
        fc.integer({ min: 1, max: PATTERN_PROMOTION_THRESHOLD - 1 }),
        async (finding, industry, locale, count) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < count; i++) {
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          const results = await engine.queryPatterns({
            minFrequency: PATTERN_PROMOTION_THRESHOLD,
          });

          // No pattern should appear — none have reached the threshold
          expect(results.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 39: Active Pattern Usage
   *
   * queryPatterns() with a plugin filter must return only patterns that
   * include that plugin in affectedPlugins.
   *
   * Validates: Requirements 9.3
   */
  it('should filter queryPatterns() results by plugin correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Yoast', 'RankMath', 'AllInOneSEO'),
        industryArb,
        localeArb,
        async (plugin, industry, locale) => {
          const engine = new PatternDiscoveryEngine();

          const finding: AuditFinding = {
            platform: 'WordPress',
            plugin,
            issueType: 'missing_schema',
            industry,
            locale,
          };

          for (let i = 0; i < PATTERN_PROMOTION_THRESHOLD; i++) {
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          const results = await engine.queryPatterns({ plugin });

          expect(results.length).toBeGreaterThan(0);
          for (const pattern of results) {
            expect(
              (pattern.affectedPlugins ?? []).some(
                (p) => p.toLowerCase() === plugin.toLowerCase(),
              ),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 40: Pattern Display Completeness
// Validates: Requirements 9.4
// ---------------------------------------------------------------------------

describe('Property 40: Pattern Display Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 40: Pattern Display Completeness
   *
   * For any pattern returned by analyzeAudit() or queryPatterns(), the pattern
   * SHALL include: description (non-empty), frequency (> 0),
   * affectedPlatforms (non-empty array), and recommendedFixes (array).
   *
   * Validates: Requirements 9.4
   */
  it('should include all required display fields in every pattern returned by analyzeAudit()', async () => {
    await fc.assert(
      fc.asyncProperty(findingsArb, industryArb, localeArb, async (findings, industry, locale) => {
        const engine = new PatternDiscoveryEngine();
        const patterns = await engine.analyzeAudit('audit-1', findings, industry, locale);

        for (const pattern of patterns) {
          // description must be a non-empty string
          expect(typeof pattern.description).toBe('string');
          expect(pattern.description.length).toBeGreaterThan(0);

          // frequency must be a positive number
          expect(typeof pattern.frequency).toBe('number');
          expect(pattern.frequency).toBeGreaterThan(0);

          // affectedPlatforms must be a non-empty array
          expect(Array.isArray(pattern.affectedPlatforms)).toBe(true);
          expect(pattern.affectedPlatforms.length).toBeGreaterThan(0);

          // recommendedFixes must be an array (may be empty for first observation)
          expect(Array.isArray(pattern.recommendedFixes)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 40: Pattern Display Completeness
   *
   * Every pattern returned by queryPatterns() must have all required display fields.
   *
   * Validates: Requirements 9.4
   */
  it('should include all required display fields in every pattern returned by queryPatterns()', async () => {
    await fc.assert(
      fc.asyncProperty(findingsArb, industryArb, localeArb, async (findings, industry, locale) => {
        const engine = new PatternDiscoveryEngine();
        await engine.analyzeAudit('audit-1', findings, industry, locale);

        const patterns = await engine.queryPatterns({});

        for (const pattern of patterns) {
          expect(typeof pattern.description).toBe('string');
          expect(pattern.description.length).toBeGreaterThan(0);

          expect(typeof pattern.frequency).toBe('number');
          expect(pattern.frequency).toBeGreaterThan(0);

          expect(Array.isArray(pattern.affectedPlatforms)).toBe(true);
          expect(pattern.affectedPlatforms.length).toBeGreaterThan(0);

          expect(Array.isArray(pattern.recommendedFixes)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 40: Pattern Display Completeness
   *
   * Patterns must also include confidenceScore (0–1), discoveredAt (Date),
   * lastObservedAt (Date), and trend fields.
   *
   * Validates: Requirements 9.4
   */
  it('should include confidenceScore, discoveredAt, lastObservedAt, and trend in every pattern', async () => {
    await fc.assert(
      fc.asyncProperty(findingsArb, industryArb, localeArb, async (findings, industry, locale) => {
        const engine = new PatternDiscoveryEngine();
        const patterns = await engine.analyzeAudit('audit-1', findings, industry, locale);

        for (const pattern of patterns) {
          expect(typeof pattern.confidenceScore).toBe('number');
          expect(pattern.confidenceScore).toBeGreaterThanOrEqual(0);
          expect(pattern.confidenceScore).toBeLessThanOrEqual(1);

          expect(pattern.discoveredAt).toBeInstanceOf(Date);
          expect(isNaN(pattern.discoveredAt.getTime())).toBe(false);

          expect(pattern.lastObservedAt).toBeInstanceOf(Date);
          expect(isNaN(pattern.lastObservedAt.getTime())).toBe(false);

          expect(['increasing', 'stable', 'decreasing']).toContain(pattern.trend);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 40: Pattern Display Completeness
   *
   * recommendedFixes must accumulate across multiple analyzeAudit() calls
   * when different fixes are provided for the same pattern.
   *
   * Validates: Requirements 9.4
   */
  it('should accumulate recommendedFixes across multiple analyzeAudit() calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        platformArb,
        issueTypeArb,
        industryArb,
        localeArb,
        fc.uniqueArray(fc.string({ minLength: 5, maxLength: 40 }), { minLength: 2, maxLength: 4 }),
        async (platform, issueType, industry, locale, fixes) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < fixes.length; i++) {
            const finding: AuditFinding = {
              platform,
              issueType,
              industry,
              locale,
              recommendedFix: fixes[i],
            };
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locale);
          }

          const patterns = await engine.queryPatterns({ platform });
          expect(patterns.length).toBeGreaterThan(0);

          const pattern = patterns[0];
          // All unique fixes must be tracked
          for (const fix of fixes) {
            expect(pattern.recommendedFixes).toContain(fix);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 41: Pattern Tracking Completeness
// Validates: Requirements 9.5
// ---------------------------------------------------------------------------

describe('Property 41: Pattern Tracking Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 41: Pattern Tracking Completeness
   *
   * For any discovered pattern, the System SHALL track which industries
   * and locales are affected — both fields must be non-empty arrays.
   *
   * Validates: Requirements 9.5
   */
  it('should track industries and locales arrays on every pattern', async () => {
    await fc.assert(
      fc.asyncProperty(findingsArb, industryArb, localeArb, async (findings, industry, locale) => {
        const engine = new PatternDiscoveryEngine();
        const patterns = await engine.analyzeAudit('audit-1', findings, industry, locale);

        for (const pattern of patterns) {
          expect(Array.isArray(pattern.industries)).toBe(true);
          expect(pattern.industries.length).toBeGreaterThan(0);

          expect(Array.isArray(pattern.locales)).toBe(true);
          expect(pattern.locales.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 41: Pattern Tracking Completeness
   *
   * When the same pattern is observed across multiple industries, all
   * industries must appear in the pattern's industries array.
   *
   * Validates: Requirements 9.5
   */
  it('should accumulate all observed industries in the pattern industries array', async () => {
    await fc.assert(
      fc.asyncProperty(
        platformArb,
        issueTypeArb,
        fc.uniqueArray(industryArb, { minLength: 2, maxLength: 4 }),
        localeArb,
        async (platform, issueType, industries, locale) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < industries.length; i++) {
            const finding: AuditFinding = { platform, issueType, locale };
            await engine.analyzeAudit(`audit-${i}`, [finding], industries[i], locale);
          }

          const patterns = await engine.queryPatterns({ platform });
          expect(patterns.length).toBeGreaterThan(0);

          const pattern = patterns[0];
          for (const industry of industries) {
            expect(pattern.industries).toContain(industry);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 41: Pattern Tracking Completeness
   *
   * When the same pattern is observed across multiple locales, all
   * locales must appear in the pattern's locales array.
   *
   * Validates: Requirements 9.5
   */
  it('should accumulate all observed locales in the pattern locales array', async () => {
    await fc.assert(
      fc.asyncProperty(
        platformArb,
        issueTypeArb,
        industryArb,
        fc.uniqueArray(localeArb, { minLength: 2, maxLength: 4 }),
        async (platform, issueType, industry, locales) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < locales.length; i++) {
            const finding: AuditFinding = { platform, issueType, industry: industry };
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locales[i]);
          }

          const patterns = await engine.queryPatterns({ platform });
          expect(patterns.length).toBeGreaterThan(0);

          const pattern = patterns[0];
          for (const locale of locales) {
            expect(pattern.locales).toContain(locale);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 41: Pattern Tracking Completeness
   *
   * The initial industry and locale passed to analyzeAudit() must always
   * appear in the pattern's industries and locales arrays.
   *
   * Validates: Requirements 9.5
   */
  it('should always include the initial industry and locale in the pattern tracking arrays', async () => {
    await fc.assert(
      fc.asyncProperty(findingArb, industryArb, localeArb, async (finding, industry, locale) => {
        const engine = new PatternDiscoveryEngine();
        const patterns = await engine.analyzeAudit('audit-1', [finding], industry, locale);

        for (const pattern of patterns) {
          expect(pattern.industries).toContain(industry);
          expect(pattern.locales).toContain(locale);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 41: Pattern Tracking Completeness
   *
   * getPatternStats() must report the correct set of locales supported
   * across all patterns.
   *
   * Validates: Requirements 9.5
   */
  it('should report all observed locales in getPatternStats().localesSupported', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(localeArb, { minLength: 2, maxLength: 4 }),
        industryArb,
        async (locales, industry) => {
          const engine = new PatternDiscoveryEngine();

          for (let i = 0; i < locales.length; i++) {
            const finding: AuditFinding = {
              platform: 'WordPress',
              issueType: 'missing_schema',
            };
            await engine.analyzeAudit(`audit-${i}`, [finding], industry, locales[i]);
          }

          const stats = await engine.getPatternStats();

          for (const locale of locales) {
            expect(stats.localesSupported).toContain(locale);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
