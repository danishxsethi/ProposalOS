import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  getCountryConfig,
  detectCountry,
  convertCurrency,
  applyCountryPricing,
  getSupportedCountries,
  isValidCountryCode,
  CountryCode,
} from '../countryConfig';

describe('Country Configuration - Property Tests', () => {
  /**
   * Property 31: Country-specific configuration application
   *
   * For any valid country code, getCountryConfig must return a configuration
   * with all required fields (code, name, language, currency, dataProviders,
   * complianceRequirements, emailTemplates, priceMultiplier, timezone).
   */
  it('Property 31: Country-specific configuration application', () => {
    const validCountries: CountryCode[] = ['US', 'UK', 'CA'];

    validCountries.forEach((countryCode) => {
      const config = getCountryConfig(countryCode);

      // Verify all required fields
      expect(config.code).toBeDefined();
      expect(config.name).toBeDefined();
      expect(config.language).toBeDefined();
      expect(config.currency).toBeDefined();
      expect(config.currencySymbol).toBeDefined();
      expect(config.dataProviders).toBeDefined();
      expect(Array.isArray(config.dataProviders)).toBe(true);
      expect(config.complianceRequirements).toBeDefined();
      expect(Array.isArray(config.complianceRequirements)).toBe(true);
      expect(config.emailTemplates).toBeDefined();
      expect(config.priceMultiplier).toBeDefined();
      expect(config.timezone).toBeDefined();

      // Verify field types
      expect(typeof config.code).toBe('string');
      expect(typeof config.name).toBe('string');
      expect(typeof config.language).toBe('string');
      expect(typeof config.currency).toBe('string');
      expect(typeof config.priceMultiplier).toBe('number');
      expect(config.priceMultiplier).toBeGreaterThan(0);
    });
  });

  /**
   * Property 32: Country detection consistency
   *
   * For any prospect data, detectCountry must return a valid country code
   * that is one of the supported countries.
   */
  it('Property 32: Country detection consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          city: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          state: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
          country: fc.option(fc.string({ minLength: 1, maxLength: 10 })),
          website: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
        }),
        (prospectData) => {
          const country = detectCountry(prospectData);

          // Must be a valid country code
          expect(isValidCountryCode(country)).toBe(true);

          // Must be one of the supported countries
          const supportedCountries = getSupportedCountries();
          const supportedCodes = supportedCountries.map((c) => c.code);
          expect(supportedCodes).toContain(country);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 33: Currency conversion round-trip
   *
   * For any amount and two different currencies, converting from A to B
   * and back to A should result in approximately the same amount (within
   * rounding error).
   */
  it('Property 33: Currency conversion round-trip', () => {
    const currencyPairs = [
      { from: 'USD', to: 'GBP' },
      { from: 'USD', to: 'CAD' },
      { from: 'GBP', to: 'CAD' },
    ];

    currencyPairs.forEach(({ from, to }) => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 100000 }), (amount) => {
          const converted = convertCurrency(amount, from, to);
          const roundTrip = convertCurrency(converted, to, from);

          // Allow 2% rounding error due to exchange rates
          expect(Math.abs(roundTrip - amount) / amount).toBeLessThan(0.02);
        }),
        { numRuns: 20 }
      );
    });
  });

  /**
   * Property 34: Country pricing multiplier bounds
   *
   * For any valid country code, the pricing multiplier must be between
   * 0.5 and 1.5 (reasonable bounds for international pricing).
   */
  it('Property 34: Country pricing multiplier bounds', () => {
    const validCountries: CountryCode[] = ['US', 'UK', 'CA'];

    validCountries.forEach((countryCode) => {
      const config = getCountryConfig(countryCode);
      expect(config.priceMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(config.priceMultiplier).toBeLessThanOrEqual(1.5);
    });
  });

  /**
   * Property 35: Applied pricing is positive
   *
   * For any base price and valid country code, the applied country pricing
   * must be positive and proportional to the base price.
   */
  it('Property 35: Applied pricing is positive', () => {
    const validCountries: CountryCode[] = ['US', 'UK', 'CA'];

    fc.assert(
      fc.property(fc.integer({ min: 100, max: 100000 }), (basePrice) => {
        validCountries.forEach((countryCode) => {
          const appliedPrice = applyCountryPricing(basePrice, countryCode);

          // Must be positive
          expect(appliedPrice).toBeGreaterThan(0);

          // Must be proportional to base price
          const config = getCountryConfig(countryCode);
          const expectedPrice = basePrice * config.priceMultiplier;
          expect(Math.abs(appliedPrice - expectedPrice)).toBeLessThan(1); // Allow 1 cent rounding
        });
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property 36: Data providers are non-empty
   *
   * For any valid country code, the data providers list must not be empty.
   */
  it('Property 36: Data providers are non-empty', () => {
    const validCountries: CountryCode[] = ['US', 'UK', 'CA'];

    validCountries.forEach((countryCode) => {
      const config = getCountryConfig(countryCode);
      expect(config.dataProviders.length).toBeGreaterThan(0);
    });
  });

  /**
   * Property 37: Compliance requirements are non-empty
   *
   * For any valid country code, the compliance requirements list must not be empty.
   */
  it('Property 37: Compliance requirements are non-empty', () => {
    const validCountries: CountryCode[] = ['US', 'UK', 'CA'];

    validCountries.forEach((countryCode) => {
      const config = getCountryConfig(countryCode);
      expect(config.complianceRequirements.length).toBeGreaterThan(0);
    });
  });
});
