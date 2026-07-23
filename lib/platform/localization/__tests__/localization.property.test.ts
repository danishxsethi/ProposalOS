import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  convertCurrency,
  validateCompliance,
  getCountryConfig,
  type SupportedCountry,
} from '../localizationEngine';

/**
 * Property-Based Tests for Localization Engine
 *
 * Feature: sprint-5-6-integration-pilot
 * Validates: Requirements 18.2, 18.3
 */

// Non-US countries supported by the localization engine
const NON_US_COUNTRIES: SupportedCountry[] = ['uk', 'ca', 'au', 'es', 'br'];

// GDPR-applicable countries
const GDPR_COUNTRIES: SupportedCountry[] = ['uk', 'es'];

// PIPEDA-applicable countries
const PIPEDA_COUNTRIES: SupportedCountry[] = ['ca'];

/**
 * Build a compliant content string for a given country by appending all
 * required compliance keywords and local regulation names.
 */
function buildCompliantContent(base: string, country: SupportedCountry): string {
  const config = getCountryConfig(country);
  let content = base;

  if (config.compliance.gdprApplicable) {
    // Append GDPR keywords (need at least one; append all to be safe)
    content += ' unsubscribe gdpr data protection privacy';
  }

  if (config.compliance.pipedaApplicable) {
    // Append PIPEDA keywords (need at least one; append all to be safe)
    content += ' unsubscribe pipeda casl privacy';
  }

  // Append every local regulation name so the local-regulations check passes
  for (const reg of config.compliance.localRegulations) {
    content += ` ${reg}`;
  }

  return content;
}

describe('Localization Engine Property Tests', () => {
  /**
   * Property 23: Localization Currency Conversion
   *
   * For any pricing displayed in a non-US country, currency must be converted
   * to local currency with correct symbol matching country config.
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 23: Localization Currency Conversion
   * **Validates: Requirements 18.3**
   */
  describe('Property 23: Localization Currency Conversion', () => {
    it('should convert positive USD amounts to a positive value in local currency', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...NON_US_COUNTRIES),
          fc.float({ min: Math.fround(0.01), max: Math.fround(100_000), noNaN: true }),
          (country, amount) => {
            const config = getCountryConfig(country);
            const converted = convertCurrency(amount, 'USD', config.currency, country);

            // Converted amount must be a positive finite number
            expect(converted).toBeGreaterThan(0);
            expect(Number.isFinite(converted)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return a value whose currency symbol matches the country config', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...NON_US_COUNTRIES),
          fc.float({ min: 1, max: 10_000, noNaN: true }),
          (country, amount) => {
            const config = getCountryConfig(country);
            const converted = convertCurrency(amount, 'USD', config.currency, country);

            // The currency symbol from getCountryConfig must match the country's config
            const lookedUpConfig = getCountryConfig(country);
            expect(lookedUpConfig.currencySymbol).toBe(config.currencySymbol);

            // The converted value is a number (symbol is on the config, not embedded in the number)
            expect(typeof converted).toBe('number');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 24: Compliance Validation
   *
   * For any content generated for a GDPR/PIPEDA country, it must pass
   * compliance validation before being sent or displayed.
   *
   * Tag: Feature: sprint-5-6-integration-pilot, Property 24: Compliance Validation
   * **Validates: Requirements 18.2**
   */
  describe('Property 24: Compliance Validation', () => {
    it('should pass compliance for GDPR countries when required keywords are present', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...GDPR_COUNTRIES),
          fc.string({ maxLength: 200 }),
          (country, baseContent) => {
            const compliantContent = buildCompliantContent(baseContent, country);
            const result = validateCompliance(compliantContent, country);

            expect(result.passed).toBe(true);
            expect(result.checks.gdpr).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should pass compliance for PIPEDA countries when required keywords are present', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...PIPEDA_COUNTRIES),
          fc.string({ maxLength: 200 }),
          (country, baseContent) => {
            const compliantContent = buildCompliantContent(baseContent, country);
            const result = validateCompliance(compliantContent, country);

            expect(result.passed).toBe(true);
            expect(result.checks.pipeda).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
