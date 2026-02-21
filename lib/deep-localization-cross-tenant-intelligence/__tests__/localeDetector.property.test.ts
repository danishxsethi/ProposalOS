/**
 * Property-based tests for Locale Detector
 * 
 * Feature: deep-localization-cross-tenant-intelligence
 * These tests verify correctness properties for locale detection across all valid inputs
 * using fast-check with 100 iterations each
 */

import * as fc from 'fast-check';
import { LocaleDetector } from '../locale-detector';
import { DetectionContext, LocaleDetectionResult } from '../types';

describe('Locale Detector - Property-Based Tests', () => {
  let detector: LocaleDetector;

  beforeEach(() => {
    detector = new LocaleDetector();
  });

  const SUPPORTED_LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES'];

  // Generators for test data
  const supportedLocaleArb = fc.oneof(...SUPPORTED_LOCALES.map(l => fc.constant(l)));
  
  const validDomainArb = fc.domain().map(domain => {
    // Ensure domain ends with a supported TLD
    const tlds = ['us', 'uk', 'ca', 'au', 'de', 'fr', 'es', 'com'];
    const tld = fc.sample(fc.oneof(...tlds.map(t => fc.constant(t))), 1)[0];
    return `example.${tld}`;
  });

  const hreflangHtmlArb = fc.oneof(...SUPPORTED_LOCALES.map(locale => 
    fc.constant(`<html><head><link rel="alternate" hreflang="${locale}" href="/" /></head></html>`)
  ));

  const gbpLocationArb = fc.oneof(
    fc.constant('Germany'),
    fc.constant('France'),
    fc.constant('Spain'),
    fc.constant('United Kingdom'),
    fc.constant('Canada'),
    fc.constant('Australia'),
    fc.constant('United States')
  );

  const ipAddressArb = fc.ipV4();

  describe('Property 1: Locale Detection Priority Chain', () => {
    /**
     * Feature: deep-localization-cross-tenant-intelligence, Property 1: Locale Detection Priority Chain
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7
     * 
     * For any detection context, the Locale_Detector SHALL respect the priority chain:
     * manual override > TLD > hreflang > GBP > IP geolocation > default (en-US)
     */
    it('should respect priority chain: manual override > TLD > hreflang > GBP > IP > default', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            manualOverride: fc.option(supportedLocaleArb),
            domain: fc.option(validDomainArb),
            htmlContent: fc.option(hreflangHtmlArb),
            gbpLocation: fc.option(gbpLocationArb),
            ipAddress: fc.option(ipAddressArb),
          }),
          async (context: DetectionContext) => {
            const result = await detector.detectLocale(context);

            // If manual override is provided, it must be selected
            if (context.manualOverride) {
              expect(result.detectedLocale).toBe(context.manualOverride);
              expect(result.detectionMethod).toBe('manual_override');
              expect(result.confidence).toBe(1.0);
            }
            // If no manual override but domain is provided, TLD should be considered
            else if (context.domain) {
              // TLD detection should be attempted
              expect(result.detectionMethod).toMatch(/^(tld|hreflang|gbp|ip_geolocation|default)$/);
            }
            // If no manual override or domain, hreflang should be considered
            else if (context.htmlContent) {
              // hreflang detection should be attempted
              expect(result.detectionMethod).toMatch(/^(hreflang|gbp|ip_geolocation|default)$/);
            }
            // If no manual override, domain, or hreflang, GBP should be considered
            else if (context.gbpLocation) {
              // GBP detection should be attempted
              expect(result.detectionMethod).toMatch(/^(gbp|ip_geolocation|default)$/);
            }
            // If no manual override, domain, hreflang, or GBP, IP geolocation should be considered
            else if (context.ipAddress) {
              // IP detection should be attempted
              expect(result.detectionMethod).toMatch(/^(ip_geolocation|default)$/);
            }
            // If all detection methods fail, default to en-US
            else {
              expect(result.detectedLocale).toBe('en-US');
              expect(result.detectionMethod).toBe('default');
            }

            // Verify result structure
            expect(result.detectedLocale).toBeDefined();
            expect(SUPPORTED_LOCALES).toContain(result.detectedLocale);
            expect(result.detectionMethod).toBeDefined();
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(Array.isArray(result.fallbackChain)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Manual Override Precedence', () => {
    /**
     * Feature: deep-localization-cross-tenant-intelligence, Property 2: Manual Override Precedence
     * Validates: Requirements 1.5
     * 
     * For any detection context with a manual locale parameter, the Locale_Detector
     * SHALL return the manual locale regardless of other detection signals.
     */
    it('should always return manual locale when provided, regardless of other signals', async () => {
      await fc.assert(
        fc.asyncProperty(
          supportedLocaleArb,
          fc.record({
            domain: fc.option(validDomainArb),
            htmlContent: fc.option(hreflangHtmlArb),
            gbpLocation: fc.option(gbpLocationArb),
            ipAddress: fc.option(ipAddressArb),
          }),
          async (manualLocale: string, otherContext: any) => {
            const context: DetectionContext = {
              ...otherContext,
              manualOverride: manualLocale,
            };

            const result = await detector.detectLocale(context);

            // Manual override must always be selected
            expect(result.detectedLocale).toBe(manualLocale);
            expect(result.detectionMethod).toBe('manual_override');
            expect(result.confidence).toBe(1.0);
            expect(result.fallbackChain[0]).toBe(manualLocale);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Locale Storage Completeness', () => {
    /**
     * Feature: deep-localization-cross-tenant-intelligence, Property 3: Locale Storage Completeness
     * Validates: Requirements 1.6
     * 
     * For any detected locale, the audit context SHALL contain the detected locale
     * value for use by downstream components.
     */
    it('should store detected locale in audit context for downstream use', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            manualOverride: fc.option(supportedLocaleArb),
            domain: fc.option(validDomainArb),
            htmlContent: fc.option(hreflangHtmlArb),
            gbpLocation: fc.option(gbpLocationArb),
            ipAddress: fc.option(ipAddressArb),
          }),
          async (context: DetectionContext) => {
            const result = await detector.detectLocale(context);

            // Detected locale must be stored and accessible
            expect(result.detectedLocale).toBeDefined();
            expect(typeof result.detectedLocale).toBe('string');
            expect(result.detectedLocale.length).toBeGreaterThan(0);

            // Detected locale must be a supported locale
            expect(SUPPORTED_LOCALES).toContain(result.detectedLocale);

            // Detected locale must be in fallback chain
            expect(result.fallbackChain).toContain(result.detectedLocale);

            // Result must have all required fields for downstream use
            expect(result.detectionMethod).toBeDefined();
            expect(result.confidence).toBeDefined();
            expect(result.fallbackChain).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Default Locale Fallback', () => {
    /**
     * Feature: deep-localization-cross-tenant-intelligence, Property 4: Default Locale Fallback
     * Validates: Requirements 1.7
     * 
     * For any detection context where all detection methods fail, the Locale_Detector
     * SHALL return en-US as the default locale.
     */
    it('should return en-US when all detection methods fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            domain: fc.constant(undefined),
            htmlContent: fc.constant(undefined),
            gbpLocation: fc.constant(undefined),
            ipAddress: fc.constant(undefined),
            manualOverride: fc.constant(undefined),
          }),
          async (context: DetectionContext) => {
            const result = await detector.detectLocale(context);

            // When all detection methods fail, default must be en-US
            expect(result.detectedLocale).toBe('en-US');
            expect(result.detectionMethod).toBe('default');
            expect(result.confidence).toBeLessThanOrEqual(0.5);
            expect(result.fallbackChain).toContain('en-US');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Additional Property Tests for Robustness', () => {
    /**
     * Property: Detection Result Validity
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7
     * 
     * For any detection context, the result must have valid structure and values
     */
    it('should always return valid detection result structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            manualOverride: fc.option(supportedLocaleArb),
            domain: fc.option(validDomainArb),
            htmlContent: fc.option(hreflangHtmlArb),
            gbpLocation: fc.option(gbpLocationArb),
            ipAddress: fc.option(ipAddressArb),
          }),
          async (context: DetectionContext) => {
            const result = await detector.detectLocale(context);

            // Verify result structure
            expect(result).toBeDefined();
            expect(result.detectedLocale).toBeDefined();
            expect(result.detectionMethod).toBeDefined();
            expect(result.confidence).toBeDefined();
            expect(result.fallbackChain).toBeDefined();

            // Verify types
            expect(typeof result.detectedLocale).toBe('string');
            expect(typeof result.detectionMethod).toBe('string');
            expect(typeof result.confidence).toBe('number');
            expect(Array.isArray(result.fallbackChain)).toBe(true);

            // Verify values
            expect(SUPPORTED_LOCALES).toContain(result.detectedLocale);
            expect(['tld', 'hreflang', 'gbp', 'ip_geolocation', 'manual_override', 'default']).toContain(result.detectionMethod);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(result.fallbackChain.length).toBeGreaterThan(0);
            result.fallbackChain.forEach(locale => {
              expect(SUPPORTED_LOCALES).toContain(locale);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Locale Configuration Availability
     * Validates: Requirements 1.1, 13.1, 13.2
     * 
     * For any detected locale, the locale configuration must be retrievable
     */
    it('should provide locale configuration for any detected locale', async () => {
      await fc.assert(
        fc.asyncProperty(
          supportedLocaleArb,
          async (locale: string) => {
            const config = await detector.getLocaleConfig(locale);

            // Config must exist for supported locale
            expect(config).toBeDefined();
            expect(config?.locale).toBe(locale);
            expect(config?.language).toBeDefined();
            expect(config?.primarySearchEngine).toBeDefined();
            expect(config?.currency).toBeDefined();
            expect(Array.isArray(config?.regulations)).toBe(true);
            expect(config?.tone).toBeDefined();
            expect(Array.isArray(config?.benchmarkCohorts)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Locale Validation Correctness
     * Validates: Requirements 1.1, 13.1, 13.2
     * 
     * For any locale, validation must correctly identify supported vs unsupported locales
     */
    it('should correctly validate supported and unsupported locales', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            supportedLocaleArb,
            fc.string().filter(s => !SUPPORTED_LOCALES.includes(s))
          ),
          async (locale: string) => {
            const isValid = await detector.validateLocale(locale);

            // Validation must match supported locales list
            if (SUPPORTED_LOCALES.includes(locale)) {
              expect(isValid).toBe(true);
            } else {
              expect(isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Supported Locales List Completeness
     * Validates: Requirements 1.1, 13.1, 13.2
     * 
     * The supported locales list must contain all launch locales
     */
    it('should return complete list of supported locales', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            const supportedLocales = await detector.getSupportedLocales();

            // Must contain all launch locales
            expect(supportedLocales).toContain('en-US');
            expect(supportedLocales).toContain('en-GB');
            expect(supportedLocales).toContain('en-CA');
            expect(supportedLocales).toContain('en-AU');
            expect(supportedLocales).toContain('de-DE');
            expect(supportedLocales).toContain('fr-FR');
            expect(supportedLocales).toContain('es-ES');

            // Must have exactly 7 locales
            expect(supportedLocales.length).toBe(7);

            // All must be strings
            supportedLocales.forEach(locale => {
              expect(typeof locale).toBe('string');
              expect(locale.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
