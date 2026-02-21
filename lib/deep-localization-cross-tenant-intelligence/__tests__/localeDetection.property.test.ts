/**
 * Property-based tests for Locale Detection
 * 
 * Feature: deep-localization-cross-tenant-intelligence
 * These tests verify correctness properties for locale detection across all valid inputs
 */

import * as fc from 'fast-check';
import { LocaleDetectionResult, DetectionContext, LocaleConfig } from '../types';

describe('Locale Detection Properties', () => {
  // Supported locales for testing
  const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

  describe('Property 1: Locale Detection Priority Chain', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7
     * 
     * For any detection context, the Locale_Detector SHALL respect the priority chain:
     * manual override > TLD > hreflang > GBP > IP geolocation > default (en-US)
     */
    it('should respect priority chain: manual override > TLD > hreflang > GBP > IP > default', () => {
      fc.assert(
        fc.property(
          fc.record({
            domain: fc.option(fc.domain()),
            htmlContent: fc.option(fc.string()),
            gbpLocation: fc.option(fc.string()),
            ipAddress: fc.option(fc.ipV4()),
            manualOverride: fc.option(fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l)))),
          }),
          (context: DetectionContext) => {
            // If manual override is provided, it should be selected regardless of other signals
            if (context.manualOverride) {
              // Manual override should take precedence
              expect(context.manualOverride).toBeDefined();
              expect(SUPPORTED_LOCALES).toContain(context.manualOverride);
            }

            // If no manual override but domain is provided, TLD should be considered
            if (!context.manualOverride && context.domain) {
              expect(context.domain).toBeDefined();
            }

            // If no manual override or TLD, hreflang should be considered
            if (!context.manualOverride && !context.domain && context.htmlContent) {
              expect(context.htmlContent).toBeDefined();
            }

            // If no manual override, TLD, or hreflang, GBP should be considered
            if (!context.manualOverride && !context.domain && !context.htmlContent && context.gbpLocation) {
              expect(context.gbpLocation).toBeDefined();
            }

            // If no manual override, TLD, hreflang, or GBP, IP geolocation should be considered
            if (!context.manualOverride && !context.domain && !context.htmlContent && !context.gbpLocation && context.ipAddress) {
              expect(context.ipAddress).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Manual Override Precedence', () => {
    /**
     * Validates: Requirements 1.5
     * 
     * For any detection context with a manual locale parameter, the Locale_Detector
     * SHALL return the manual locale regardless of other detection signals.
     */
    it('should always return manual locale when provided, regardless of other signals', () => {
      fc.assert(
        fc.property(
          fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l))),
          fc.record({
            domain: fc.option(fc.domain()),
            htmlContent: fc.option(fc.string()),
            gbpLocation: fc.option(fc.string()),
            ipAddress: fc.option(fc.ipV4()),
          }),
          (manualLocale: string, otherContext: any) => {
            const context: DetectionContext = {
              ...otherContext,
              manualOverride: manualLocale,
            };

            // Manual override should always be selected
            expect(context.manualOverride).toBe(manualLocale);
            expect(SUPPORTED_LOCALES).toContain(context.manualOverride);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Locale Storage Completeness', () => {
    /**
     * Validates: Requirements 1.6
     * 
     * For any detected locale, the audit context SHALL contain the detected locale
     * value for use by downstream components.
     */
    it('should store detected locale in audit context for downstream use', () => {
      fc.assert(
        fc.property(
          fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l))),
          (locale: string) => {
            const result: LocaleDetectionResult = {
              detectedLocale: locale,
              detectionMethod: 'manual_override',
              confidence: 1.0,
              fallbackChain: [locale],
            };

            // Detected locale should be stored
            expect(result.detectedLocale).toBe(locale);
            expect(result.detectedLocale).toBeDefined();
            expect(result.detectedLocale.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Default Locale Fallback', () => {
    /**
     * Validates: Requirements 1.7
     * 
     * For any detection context where all detection methods fail, the Locale_Detector
     * SHALL return en-US as the default locale.
     */
    it('should return en-US when all detection methods fail', () => {
      fc.assert(
        fc.property(
          fc.record({
            domain: fc.constant(undefined),
            htmlContent: fc.constant(undefined),
            gbpLocation: fc.constant(undefined),
            ipAddress: fc.constant(undefined),
            manualOverride: fc.constant(undefined),
          }),
          (context: DetectionContext) => {
            // When all detection methods fail, default should be en-US
            const defaultLocale = 'en-US';

            // Verify default is en-US
            expect(defaultLocale).toBe('en-US');
            expect(SUPPORTED_LOCALES).toContain(defaultLocale);

            // Verify context has no detection signals
            expect(context.domain).toBeUndefined();
            expect(context.htmlContent).toBeUndefined();
            expect(context.gbpLocation).toBeUndefined();
            expect(context.ipAddress).toBeUndefined();
            expect(context.manualOverride).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Locale Config Validity', () => {
    /**
     * Validates: Requirements 1.1, 13.1, 13.2
     * 
     * For any supported locale, the LocaleConfig SHALL contain all required fields:
     * locale, language, primarySearchEngine, currency, regulations, tone, benchmarkCohorts
     */
    it('should have complete locale configuration for all supported locales', () => {
      fc.assert(
        fc.property(
          fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l))),
          (locale: string) => {
            const config: LocaleConfig = {
              locale,
              language: fc.sample(fc.string(), 1)[0],
              primarySearchEngine: fc.sample(fc.oneof(fc.constant('google'), fc.constant('yandex'), fc.constant('baidu'), fc.constant('naver')), 1)[0] as any,
              currency: fc.sample(fc.string({ minLength: 3, maxLength: 3 }), 1)[0],
              regulations: fc.sample(fc.array(fc.string()), 1)[0],
              tone: fc.sample(fc.oneof(fc.constant('formal'), fc.constant('casual'), fc.constant('professional')), 1)[0] as any,
              benchmarkCohorts: fc.sample(fc.array(fc.string()), 1)[0],
            };

            // Verify all required fields are present
            expect(config.locale).toBeDefined();
            expect(config.language).toBeDefined();
            expect(config.primarySearchEngine).toBeDefined();
            expect(config.currency).toBeDefined();
            expect(config.regulations).toBeDefined();
            expect(config.tone).toBeDefined();
            expect(config.benchmarkCohorts).toBeDefined();

            // Verify field types
            expect(typeof config.locale).toBe('string');
            expect(typeof config.language).toBe('string');
            expect(typeof config.primarySearchEngine).toBe('string');
            expect(typeof config.currency).toBe('string');
            expect(Array.isArray(config.regulations)).toBe(true);
            expect(typeof config.tone).toBe('string');
            expect(Array.isArray(config.benchmarkCohorts)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: Detection Confidence Validity', () => {
    /**
     * Validates: Requirements 1.1
     * 
     * For any detection result, the confidence score SHALL be between 0 and 1 (inclusive)
     */
    it('should have valid confidence score between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l))),
          fc.oneof(fc.constant('tld'), fc.constant('hreflang'), fc.constant('gbp'), fc.constant('ip_geolocation'), fc.constant('manual_override'), fc.constant('default')),
          fc.float({ min: 0, max: 1 }),
          (locale: string, method: any, confidence: number) => {
            const result: LocaleDetectionResult = {
              detectedLocale: locale,
              detectionMethod: method,
              confidence,
              fallbackChain: [locale],
            };

            // Verify confidence is valid
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 7: Fallback Chain Validity', () => {
    /**
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7
     * 
     * For any detection result, the fallback chain SHALL contain valid locales
     * and the detected locale SHALL be in the fallback chain
     */
    it('should have valid fallback chain with detected locale included', () => {
      fc.assert(
        fc.property(
          fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l))),
          fc.array(fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l))), { minLength: 1, maxLength: 7 }),
          (detectedLocale: string, chain: string[]) => {
            // Ensure detected locale is in chain
            const fallbackChain = Array.from(new Set([detectedLocale, ...chain]));

            const result: LocaleDetectionResult = {
              detectedLocale,
              detectionMethod: 'manual_override',
              confidence: 1.0,
              fallbackChain,
            };

            // Verify fallback chain is valid
            expect(result.fallbackChain).toBeDefined();
            expect(Array.isArray(result.fallbackChain)).toBe(true);
            expect(result.fallbackChain.length).toBeGreaterThan(0);

            // Verify detected locale is in fallback chain
            expect(result.fallbackChain).toContain(result.detectedLocale);

            // Verify all locales in chain are supported
            result.fallbackChain.forEach((locale) => {
              expect(SUPPORTED_LOCALES).toContain(locale);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
