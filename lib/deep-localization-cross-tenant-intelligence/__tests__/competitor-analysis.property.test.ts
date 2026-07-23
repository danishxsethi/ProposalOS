/**
 * Property-based tests for CompetitorAnalysisLocalizer
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 13.2: Write property tests for competitor analysis
 *   - Property 17: Competitor Locale Identification
 *   - Property 18: Multi-Locale Competitor Analysis
 *   - Property 19: Competitor Metrics Localization
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CompetitorAnalysisLocalizer } from '../competitor-analysis-localizer';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** All supported locales for competitor analysis. */
const localeArb = fc.constantFrom(
  'en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES', 'ru-RU', 'zh-CN', 'ko-KR',
);

/** Supported industries. */
const industryArb = fc.constantFrom(
  'dental', 'restaurant', 'ecommerce', 'legal', 'medical',
);

/** Search engine mapping (mirrors SearchEngineAdapter logic). */
function expectedSearchEngine(locale: string): string {
  const map: Record<string, string> = {
    'ru-RU': 'Yandex',
    'zh-CN': 'Baidu',
    'ko-KR': 'Naver',
  };
  return map[locale] ?? 'Google';
}

// ---------------------------------------------------------------------------
// Property 17: Competitor Locale Identification
// Validates: Requirements 5.1
// ---------------------------------------------------------------------------

describe('Property 17: Competitor Locale Identification', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 17: Competitor Locale Identification
   *
   * For any locale and industry, identifyCompetitors() should return competitors
   * all having the same locale and industry.
   *
   * Validates: Requirements 5.1
   */
  it('should return only competitors matching the requested locale', async () => {
    await fc.assert(
      fc.asyncProperty(localeArb, industryArb, async (locale, industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitors = await localizer.identifyCompetitors(locale, industry);

        for (const competitor of competitors) {
          expect(competitor.locale).toBe(locale);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 17: Competitor Locale Identification
   *
   * For any locale and industry, identifyCompetitors() should return competitors
   * all having the same industry.
   *
   * Validates: Requirements 5.1
   */
  it('should return only competitors matching the requested industry', async () => {
    await fc.assert(
      fc.asyncProperty(localeArb, industryArb, async (locale, industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitors = await localizer.identifyCompetitors(locale, industry);

        for (const competitor of competitors) {
          expect(competitor.industry).toBe(industry);
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 17: Competitor Locale Identification
   *
   * identifyCompetitors() should always return an array (never null/undefined).
   *
   * Validates: Requirements 5.1
   */
  it('should always return an array for any locale and industry combination', async () => {
    await fc.assert(
      fc.asyncProperty(localeArb, industryArb, async (locale, industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitors = await localizer.identifyCompetitors(locale, industry);

        expect(Array.isArray(competitors)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Multi-Locale Competitor Analysis
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------

describe('Property 18: Multi-Locale Competitor Analysis', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 18: Multi-Locale Competitor Analysis
   *
   * For any list of locales, analyzeMultiLocale() should return a Map with
   * an entry for each locale (separate analysis per locale).
   *
   * Validates: Requirements 5.2
   */
  it('should return a Map entry for every locale provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(localeArb, { minLength: 1, maxLength: 5 }),
        industryArb,
        async (locales, industry) => {
          const localizer = new CompetitorAnalysisLocalizer();
          const result = await localizer.analyzeMultiLocale(locales, industry);

          expect(result instanceof Map).toBe(true);
          for (const locale of locales) {
            expect(result.has(locale)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 18: Multi-Locale Competitor Analysis
   *
   * The Map returned by analyzeMultiLocale() should have exactly as many entries
   * as there are unique locales in the input.
   *
   * Validates: Requirements 5.2
   */
  it('should return a Map with exactly one entry per unique locale', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(localeArb, { minLength: 1, maxLength: 5 }),
        industryArb,
        async (locales, industry) => {
          const localizer = new CompetitorAnalysisLocalizer();
          const result = await localizer.analyzeMultiLocale(locales, industry);

          expect(result.size).toBe(locales.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 18: Multi-Locale Competitor Analysis
   *
   * Each locale entry in the result Map should contain only competitors
   * matching that locale.
   *
   * Validates: Requirements 5.2
   */
  it('should keep competitor results isolated per locale', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(localeArb, { minLength: 2, maxLength: 5 }),
        industryArb,
        async (locales, industry) => {
          const localizer = new CompetitorAnalysisLocalizer();
          const result = await localizer.analyzeMultiLocale(locales, industry);

          for (const [locale, competitors] of result.entries()) {
            for (const competitor of competitors) {
              expect(competitor.locale).toBe(locale);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Competitor Metrics Localization
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------

describe('Property 19: Competitor Metrics Localization', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 19: Competitor Metrics Localization
   *
   * For any competitor and locale, getLocaleSpecificMetrics() should return metrics
   * with the locale-appropriate search engine as the primary engine.
   *
   * Search engine mapping:
   *   ru-RU → Yandex
   *   zh-CN → Baidu
   *   ko-KR → Naver
   *   all others → Google
   *
   * Validates: Requirements 5.3
   */
  it('should use the locale-appropriate search engine as the primary engine in metrics', async () => {
    await fc.assert(
      fc.asyncProperty(localeArb, industryArb, async (locale, industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitor = {
          domain: 'example.com',
          name: 'Example Business',
          locale,
          industry,
          searchEngine: expectedSearchEngine(locale),
        };

        const metrics = await localizer.getLocaleSpecificMetrics(competitor, locale);

        expect(metrics.searchEngine).toBe(expectedSearchEngine(locale));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 19: Competitor Metrics Localization
   *
   * Metrics returned should always include the locale field matching the requested locale.
   *
   * Validates: Requirements 5.3
   */
  it('should return metrics with the correct locale field', async () => {
    await fc.assert(
      fc.asyncProperty(localeArb, industryArb, async (locale, industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitor = {
          domain: 'example.com',
          name: 'Example Business',
          locale,
          industry,
          searchEngine: expectedSearchEngine(locale),
        };

        const metrics = await localizer.getLocaleSpecificMetrics(competitor, locale);

        expect(metrics.locale).toBe(locale);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 19: Competitor Metrics Localization
   *
   * Metrics for ru-RU should always use Yandex as the search engine.
   *
   * Validates: Requirements 5.3
   */
  it('should use Yandex for ru-RU locale metrics', async () => {
    await fc.assert(
      fc.asyncProperty(industryArb, async (industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitor = {
          domain: 'example.ru',
          name: 'Russian Business',
          locale: 'ru-RU',
          industry,
          searchEngine: 'Yandex',
        };

        const metrics = await localizer.getLocaleSpecificMetrics(competitor, 'ru-RU');

        expect(metrics.searchEngine).toBe('Yandex');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 19: Competitor Metrics Localization
   *
   * Metrics for zh-CN should always use Baidu as the search engine.
   *
   * Validates: Requirements 5.3
   */
  it('should use Baidu for zh-CN locale metrics', async () => {
    await fc.assert(
      fc.asyncProperty(industryArb, async (industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitor = {
          domain: 'example.cn',
          name: 'Chinese Business',
          locale: 'zh-CN',
          industry,
          searchEngine: 'Baidu',
        };

        const metrics = await localizer.getLocaleSpecificMetrics(competitor, 'zh-CN');

        expect(metrics.searchEngine).toBe('Baidu');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 19: Competitor Metrics Localization
   *
   * Metrics for ko-KR should always use Naver as the search engine.
   *
   * Validates: Requirements 5.3
   */
  it('should use Naver for ko-KR locale metrics', async () => {
    await fc.assert(
      fc.asyncProperty(industryArb, async (industry) => {
        const localizer = new CompetitorAnalysisLocalizer();
        const competitor = {
          domain: 'example.kr',
          name: 'Korean Business',
          locale: 'ko-KR',
          industry,
          searchEngine: 'Naver',
        };

        const metrics = await localizer.getLocaleSpecificMetrics(competitor, 'ko-KR');

        expect(metrics.searchEngine).toBe('Naver');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 19: Competitor Metrics Localization
   *
   * Metrics for all non-special locales should use Google as the search engine.
   *
   * Validates: Requirements 5.3
   */
  it('should use Google for all standard locales', async () => {
    const googleLocales = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...googleLocales),
        industryArb,
        async (locale, industry) => {
          const localizer = new CompetitorAnalysisLocalizer();
          const competitor = {
            domain: 'example.com',
            name: 'Business',
            locale,
            industry,
            searchEngine: 'Google',
          };

          const metrics = await localizer.getLocaleSpecificMetrics(competitor, locale);

          expect(metrics.searchEngine).toBe('Google');
        },
      ),
      { numRuns: 100 },
    );
  });
});
