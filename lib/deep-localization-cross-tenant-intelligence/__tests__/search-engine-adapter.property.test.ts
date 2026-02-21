/**
 * Property-based tests for SearchEngineAdapter
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 12.2: Write property tests for search engine adaptation
 *   - Property 10: Search Engine Prioritization
 *   - Property 11: Search Engine-Specific Guidance
 *   - Property 12: Search Visibility Metrics Display
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

import * as fc from 'fast-check';
import { SearchEngineAdapter } from '../search-engine-adapter';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Locales that map to a non-Google primary search engine. */
const nonGoogleLocaleArb = fc.constantFrom(
  { locale: 'ru-RU', engine: 'Yandex' },
  { locale: 'zh-CN', engine: 'Baidu' },
  { locale: 'ko-KR', engine: 'Naver' },
  { locale: 'ja-JP', engine: 'Yahoo Japan' },
);

/** Locales that default to Google. */
const googleLocaleArb = fc.constantFrom(
  'en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES',
);

/** All supported locales. */
const anyLocaleArb = fc.oneof(
  nonGoogleLocaleArb.map((x) => x.locale),
  googleLocaleArb,
);

/** Recommendation type strings. */
const recommendationTypeArb = fc.oneof(
  fc.constant('schema'),
  fc.constant('meta'),
  fc.constant('content'),
  fc.constant('performance'),
  fc.constant('title'),
  fc.constant('description'),
  fc.constant('structured_data'),
  fc.constant('core_web_vitals'),
  fc.constant('keyword_optimization'),
  fc.constant('other'),
);

// ---------------------------------------------------------------------------
// Property 10: Search Engine Prioritization
// Validates: Requirements 3.1, 3.3
// ---------------------------------------------------------------------------

describe('Property 10: Search Engine Prioritization', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 10: Search Engine Prioritization
   *
   * For any audit in a locale with a dominant non-Google search engine
   * (ru-RU → Yandex, zh-CN → Baidu, ko-KR → Naver, ja-JP → Yahoo Japan),
   * the Localization_Engine SHALL prioritize that search engine.
   *
   * Validates: Requirements 3.1, 3.3
   */
  it('should return the correct non-Google engine for each non-Google locale', () => {
    fc.assert(
      fc.property(nonGoogleLocaleArb, ({ locale, engine }) => {
        const adapter = new SearchEngineAdapter();
        expect(adapter.getPrimarySearchEngine(locale)).toBe(engine);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 10: Search Engine Prioritization
   *
   * For any locale that is not in the non-Google mapping, Google SHALL be returned.
   *
   * Validates: Requirements 3.1
   */
  it('should return Google for all standard Google-default locales', () => {
    fc.assert(
      fc.property(googleLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        expect(adapter.getPrimarySearchEngine(locale)).toBe('Google');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 10: Search Engine Prioritization
   *
   * The competitor analysis engine SHALL match the primary search engine for any locale.
   *
   * Validates: Requirements 3.3
   */
  it('should use the same engine for competitor analysis as the primary engine', () => {
    fc.assert(
      fc.property(anyLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        expect(adapter.getCompetitorAnalysisEngine(locale)).toBe(
          adapter.getPrimarySearchEngine(locale),
        );
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 10: Search Engine Prioritization
   *
   * The primary search engine result SHALL always be a non-empty string.
   *
   * Validates: Requirements 3.1
   */
  it('should always return a non-empty engine name for any locale', () => {
    fc.assert(
      fc.property(anyLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        const engine = adapter.getPrimarySearchEngine(locale);
        expect(typeof engine).toBe('string');
        expect(engine.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Search Engine-Specific Guidance
// Validates: Requirements 3.2
// ---------------------------------------------------------------------------

describe('Property 11: Search Engine-Specific Guidance', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 11: Search Engine-Specific Guidance
   *
   * For any recommendation generated for a locale with a non-Google search engine,
   * the recommendation SHALL include search-engine-specific guidance that references
   * the locale-appropriate engine by name.
   *
   * Validates: Requirements 3.2
   */
  it('should include the locale-appropriate engine name in guidance for non-Google locales', () => {
    fc.assert(
      fc.property(
        nonGoogleLocaleArb,
        recommendationTypeArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        ({ locale, engine }, type, description) => {
          const adapter = new SearchEngineAdapter();
          const guidance = adapter.generateSearchEngineGuidance({ type, description }, locale);
          expect(guidance).toContain(engine);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 11: Search Engine-Specific Guidance
   *
   * For any recommendation in a Google-default locale, guidance SHALL reference Google.
   *
   * Validates: Requirements 3.2
   */
  it('should include Google in guidance for Google-default locales', () => {
    fc.assert(
      fc.property(
        googleLocaleArb,
        recommendationTypeArb,
        fc.string({ minLength: 1, maxLength: 100 }),
        (locale, type, description) => {
          const adapter = new SearchEngineAdapter();
          const guidance = adapter.generateSearchEngineGuidance({ type, description }, locale);
          expect(guidance).toContain('Google');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 11: Search Engine-Specific Guidance
   *
   * Guidance SHALL always be a non-empty string for any locale and recommendation type.
   *
   * Validates: Requirements 3.2
   */
  it('should always return non-empty guidance for any locale and recommendation type', () => {
    fc.assert(
      fc.property(
        anyLocaleArb,
        recommendationTypeArb,
        fc.string({ minLength: 0, maxLength: 200 }),
        (locale, type, description) => {
          const adapter = new SearchEngineAdapter();
          const guidance = adapter.generateSearchEngineGuidance({ type, description }, locale);
          expect(typeof guidance).toBe('string');
          expect(guidance.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 11: Search Engine-Specific Guidance
   *
   * Guidance for the same locale SHALL always reference the same engine regardless of recommendation type.
   *
   * Validates: Requirements 3.2
   */
  it('should reference the same engine for all recommendation types within a locale', () => {
    fc.assert(
      fc.property(
        anyLocaleArb,
        fc.tuple(recommendationTypeArb, recommendationTypeArb),
        (locale, [typeA, typeB]) => {
          const adapter = new SearchEngineAdapter();
          const engine = adapter.getPrimarySearchEngine(locale);
          const guidanceA = adapter.generateSearchEngineGuidance({ type: typeA, description: 'desc' }, locale);
          const guidanceB = adapter.generateSearchEngineGuidance({ type: typeB, description: 'desc' }, locale);
          expect(guidanceA).toContain(engine);
          expect(guidanceB).toContain(engine);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Search Visibility Metrics Display
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

describe('Property 12: Search Visibility Metrics Display', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 12: Search Visibility Metrics Display
   *
   * For any search visibility metrics displayed in a specific locale,
   * the locale-appropriate search engine SHALL be shown as the primary engine.
   *
   * Validates: Requirements 3.4
   */
  it('should show the locale-appropriate engine as primaryEngine for non-Google locales', () => {
    fc.assert(
      fc.property(nonGoogleLocaleArb, ({ locale, engine }) => {
        const adapter = new SearchEngineAdapter();
        const result = adapter.getSearchVisibilityMetrics(locale);
        expect(result.primaryEngine).toBe(engine);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 12: Search Visibility Metrics Display
   *
   * For Google-default locales, Google SHALL be shown as the primary engine.
   *
   * Validates: Requirements 3.4
   */
  it('should show Google as primaryEngine for Google-default locales', () => {
    fc.assert(
      fc.property(googleLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        const result = adapter.getSearchVisibilityMetrics(locale);
        expect(result.primaryEngine).toBe('Google');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 12: Search Visibility Metrics Display
   *
   * The primaryEngine in search visibility metrics SHALL always match getPrimarySearchEngine().
   *
   * Validates: Requirements 3.4
   */
  it('should have primaryEngine consistent with getPrimarySearchEngine for any locale', () => {
    fc.assert(
      fc.property(anyLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        const result = adapter.getSearchVisibilityMetrics(locale);
        expect(result.primaryEngine).toBe(adapter.getPrimarySearchEngine(locale));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 12: Search Visibility Metrics Display
   *
   * The metrics array SHALL be non-empty and contain the engine name for any locale.
   *
   * Validates: Requirements 3.4
   */
  it('should return non-empty metrics array containing the engine name for any locale', () => {
    fc.assert(
      fc.property(anyLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        const result = adapter.getSearchVisibilityMetrics(locale);
        expect(Array.isArray(result.metrics)).toBe(true);
        expect(result.metrics.length).toBeGreaterThan(0);
        const allMetrics = result.metrics.join(' ');
        expect(allMetrics).toContain(result.primaryEngine);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 12: Search Visibility Metrics Display
   *
   * Every metric in the metrics array SHALL be a non-empty string.
   *
   * Validates: Requirements 3.4
   */
  it('should return only non-empty string metrics for any locale', () => {
    fc.assert(
      fc.property(anyLocaleArb, (locale) => {
        const adapter = new SearchEngineAdapter();
        const result = adapter.getSearchVisibilityMetrics(locale);
        for (const metric of result.metrics) {
          expect(typeof metric).toBe('string');
          expect(metric.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
