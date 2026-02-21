/**
 * Property-based tests for LocaleExtensibilityFramework
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 15.2: Write property tests for locale extensibility
 *   - Property 60: Locale Configuration Extensibility
 *   - Property 61: Locale Configuration Completeness
 *   - Property 62: New Locale Variant Requirement
 *   - Property 63: New Locale Variant Approval
 *   - Property 64: New Locale Benchmark Collection
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  LocaleExtensibilityFramework,
  type LocaleConfig,
} from '../locale-extensibility-framework';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a fully valid locale configuration.
 * nativeSpeakerReviewRequired is always true so addLocale() can reach 'deployed'.
 */
const validLocaleConfigArb = fc.record<LocaleConfig>({
  locale: fc.string({ minLength: 2, maxLength: 10 }),
  language: fc.string({ minLength: 2, maxLength: 50 }),
  primarySearchEngine: fc.constantFrom('google', 'yandex', 'baidu', 'naver') as fc.Arbitrary<
    'google' | 'yandex' | 'baidu' | 'naver'
  >,
  currency: fc.string({ minLength: 3, maxLength: 3 }),
  regulations: fc.array(fc.string({ minLength: 2, maxLength: 20 })),
  tone: fc.constantFrom('formal', 'casual', 'professional') as fc.Arbitrary<
    'formal' | 'casual' | 'professional'
  >,
  nativeSpeakerReviewRequired: fc.constant(true),
});

/** Arbitrary for a locale string. */
const localeStringArb = fc.string({ minLength: 2, maxLength: 10 });

// ---------------------------------------------------------------------------
// Property 60: Locale Configuration Extensibility
// Validates: Requirements 13.1
// ---------------------------------------------------------------------------

describe('Property 60: Locale Configuration Extensibility', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 60: Locale Configuration Extensibility
   *
   * For any valid locale config, addLocale() should succeed (deployed or pending_review)
   * without requiring anything beyond the config file.
   *
   * Validates: Requirements 13.1
   */
  it('should succeed (deployed or pending_review) for any valid locale config', async () => {
    await fc.assert(
      fc.asyncProperty(validLocaleConfigArb, async (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = await framework.addLocale(config);

        expect(['deployed', 'pending_review']).toContain(result.status);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 60: Locale Configuration Extensibility
   *
   * addLocale() should never return 'validation_failed' for a fully valid config.
   *
   * Validates: Requirements 13.1
   */
  it('should never return validation_failed for a valid config', async () => {
    await fc.assert(
      fc.asyncProperty(validLocaleConfigArb, async (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = await framework.addLocale(config);

        expect(result.status).not.toBe('validation_failed');
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 61: Locale Configuration Completeness
// Validates: Requirements 13.2
// ---------------------------------------------------------------------------

describe('Property 61: Locale Configuration Completeness', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 61: Locale Configuration Completeness
   *
   * For any config missing the 'language' field, validateLocaleConfig() should
   * return valid=false with errors.
   *
   * Validates: Requirements 13.2
   */
  it('should reject config missing language', () => {
    fc.assert(
      fc.property(validLocaleConfigArb, (config) => {
        const framework = new LocaleExtensibilityFramework();
        const incomplete = { ...config, language: '' };
        const result = framework.validateLocaleConfig(incomplete);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 61: Locale Configuration Completeness
   *
   * For any config missing the 'primarySearchEngine' field, validateLocaleConfig()
   * should return valid=false with errors.
   *
   * Validates: Requirements 13.2
   */
  it('should reject config missing primarySearchEngine', () => {
    fc.assert(
      fc.property(validLocaleConfigArb, (config) => {
        const framework = new LocaleExtensibilityFramework();
        // Cast to any to allow an invalid value
        const incomplete = { ...config, primarySearchEngine: '' as any };
        const result = framework.validateLocaleConfig(incomplete);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 61: Locale Configuration Completeness
   *
   * For any config missing the 'currency' field, validateLocaleConfig() should
   * return valid=false with errors.
   *
   * Validates: Requirements 13.2
   */
  it('should reject config missing currency', () => {
    fc.assert(
      fc.property(validLocaleConfigArb, (config) => {
        const framework = new LocaleExtensibilityFramework();
        const incomplete = { ...config, currency: '' };
        const result = framework.validateLocaleConfig(incomplete);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 61: Locale Configuration Completeness
   *
   * For any config missing the 'regulations' field, validateLocaleConfig() should
   * return valid=false with errors.
   *
   * Validates: Requirements 13.2
   */
  it('should reject config missing regulations', () => {
    fc.assert(
      fc.property(validLocaleConfigArb, (config) => {
        const framework = new LocaleExtensibilityFramework();
        const incomplete = { ...config, regulations: null as any };
        const result = framework.validateLocaleConfig(incomplete);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 61: Locale Configuration Completeness
   *
   * For any config missing the 'tone' field, validateLocaleConfig() should
   * return valid=false with errors.
   *
   * Validates: Requirements 13.2
   */
  it('should reject config missing tone', () => {
    fc.assert(
      fc.property(validLocaleConfigArb, (config) => {
        const framework = new LocaleExtensibilityFramework();
        const incomplete = { ...config, tone: '' as any };
        const result = framework.validateLocaleConfig(incomplete);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 61: Locale Configuration Completeness
   *
   * A fully specified config should pass validation.
   *
   * Validates: Requirements 13.2
   */
  it('should accept a fully specified config', () => {
    fc.assert(
      fc.property(validLocaleConfigArb, (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = framework.validateLocaleConfig(config);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 62: New Locale Variant Requirement
// Validates: Requirements 13.3
// ---------------------------------------------------------------------------

describe('Property 62: New Locale Variant Requirement', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 62: New Locale Variant Requirement
   *
   * requiresNativeSpeakerReview() should return true for any locale string,
   * indicating that all locales require native speaker review (and therefore
   * all node prompt variants are required before deployment).
   *
   * Validates: Requirements 13.3
   */
  it('should require native speaker review for any locale', () => {
    fc.assert(
      fc.property(localeStringArb, (locale) => {
        const framework = new LocaleExtensibilityFramework();
        const required = framework.requiresNativeSpeakerReview(locale);

        expect(required).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 63: New Locale Variant Approval
// Validates: Requirements 13.4
// ---------------------------------------------------------------------------

describe('Property 63: New Locale Variant Approval', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 63: New Locale Variant Approval
   *
   * For any locale config without nativeSpeakerReviewRequired=true, addLocale()
   * should return status='pending_review' (not deployed).
   *
   * Validates: Requirements 13.4
   */
  it('should return pending_review when nativeSpeakerReviewRequired is not true', async () => {
    const configWithoutReview = fc.record<LocaleConfig>({
      locale: fc.string({ minLength: 2, maxLength: 10 }),
      language: fc.string({ minLength: 2, maxLength: 50 }),
      primarySearchEngine: fc.constantFrom('google', 'yandex', 'baidu', 'naver') as fc.Arbitrary<
        'google' | 'yandex' | 'baidu' | 'naver'
      >,
      currency: fc.string({ minLength: 3, maxLength: 3 }),
      regulations: fc.array(fc.string({ minLength: 2, maxLength: 20 })),
      tone: fc.constantFrom('formal', 'casual', 'professional') as fc.Arbitrary<
        'formal' | 'casual' | 'professional'
      >,
      nativeSpeakerReviewRequired: fc.constant(false),
    });

    await fc.assert(
      fc.asyncProperty(configWithoutReview, async (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = await framework.addLocale(config);

        expect(result.status).toBe('pending_review');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 63: New Locale Variant Approval
   *
   * A locale with nativeSpeakerReviewRequired=true should be deployed (not pending_review).
   *
   * Validates: Requirements 13.4
   */
  it('should deploy when nativeSpeakerReviewRequired is true', async () => {
    await fc.assert(
      fc.asyncProperty(validLocaleConfigArb, async (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = await framework.addLocale(config);

        expect(result.status).toBe('deployed');
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 64: New Locale Benchmark Collection
// Validates: Requirements 13.5
// ---------------------------------------------------------------------------

describe('Property 64: New Locale Benchmark Collection', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 64: New Locale Benchmark Collection
   *
   * For any locale deployed via deployLocale(), isBenchmarkCollectionStarted()
   * should return true.
   *
   * Validates: Requirements 13.5
   */
  it('should start benchmark collection when a locale is deployed', async () => {
    await fc.assert(
      fc.asyncProperty(localeStringArb, async (locale) => {
        const framework = new LocaleExtensibilityFramework();
        await framework.deployLocale(locale);

        expect(framework.isBenchmarkCollectionStarted(locale)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 64: New Locale Benchmark Collection
   *
   * For any valid locale config with nativeSpeakerReviewRequired=true, addLocale()
   * should return benchmarkCollectionStarted=true.
   *
   * Validates: Requirements 13.5
   */
  it('should report benchmarkCollectionStarted=true in the deployment result', async () => {
    await fc.assert(
      fc.asyncProperty(validLocaleConfigArb, async (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = await framework.addLocale(config);

        expect(result.benchmarkCollectionStarted).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 64: New Locale Benchmark Collection
   *
   * Benchmark collection should not be started for a locale that has only been
   * added but not yet deployed (pending_review).
   *
   * Validates: Requirements 13.5
   */
  it('should not start benchmark collection for pending_review locales', async () => {
    const configWithoutReview = fc.record<LocaleConfig>({
      locale: fc.string({ minLength: 2, maxLength: 10 }),
      language: fc.string({ minLength: 2, maxLength: 50 }),
      primarySearchEngine: fc.constantFrom('google', 'yandex', 'baidu', 'naver') as fc.Arbitrary<
        'google' | 'yandex' | 'baidu' | 'naver'
      >,
      currency: fc.string({ minLength: 3, maxLength: 3 }),
      regulations: fc.array(fc.string({ minLength: 2, maxLength: 20 })),
      tone: fc.constantFrom('formal', 'casual', 'professional') as fc.Arbitrary<
        'formal' | 'casual' | 'professional'
      >,
      nativeSpeakerReviewRequired: fc.constant(false),
    });

    await fc.assert(
      fc.asyncProperty(configWithoutReview, async (config) => {
        const framework = new LocaleExtensibilityFramework();
        const result = await framework.addLocale(config);

        // pending_review means not deployed, so benchmark collection should not have started
        expect(result.status).toBe('pending_review');
        expect(result.benchmarkCollectionStarted).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
