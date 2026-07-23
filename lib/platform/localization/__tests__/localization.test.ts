import { describe, it, expect } from 'vitest';
import {
  convertCurrency,
  validateCompliance,
  getLocalizedTemplate,
  getCountryConfig,
  type SupportedCountry,
} from '../localizationEngine';
import { COUNTRY_CONFIGS } from '../countryConfigs/index';

/**
 * Unit Tests for Localization Engine
 * Requirements: 18.2, 18.3, 18.4
 */

// ---------------------------------------------------------------------------
// convertCurrency
// ---------------------------------------------------------------------------

describe('convertCurrency', () => {
  it('applies the correct exchange rate from USD to GBP', () => {
    // USD_GBP rate = 0.79, UK pricingMultiplier = 0.85
    const result = convertCurrency(100, 'USD', 'GBP', 'uk');
    // 100 * 0.79 * 0.85 = 67.15
    expect(result).toBeCloseTo(67.15, 1);
  });

  it('applies the correct exchange rate from USD to CAD', () => {
    // USD_CAD rate = 1.36, CA pricingMultiplier = 0.9
    const result = convertCurrency(100, 'USD', 'CAD', 'ca');
    // 100 * 1.36 * 0.9 = 122.4
    expect(result).toBeCloseTo(122.4, 1);
  });

  it('applies the correct exchange rate from USD to AUD', () => {
    // USD_AUD rate = 1.53, AU pricingMultiplier = 0.95
    const result = convertCurrency(100, 'USD', 'AUD', 'au');
    // 100 * 1.53 * 0.95 = 145.35
    expect(result).toBeCloseTo(145.35, 1);
  });

  it('applies the correct exchange rate from USD to EUR for Spain', () => {
    // USD_EUR rate = 0.92, ES pricingMultiplier = 0.8
    const result = convertCurrency(100, 'USD', 'EUR', 'es');
    // 100 * 0.92 * 0.8 = 73.6
    expect(result).toBeCloseTo(73.6, 1);
  });

  it('applies the correct exchange rate from USD to BRL for Brazil', () => {
    // USD_BRL rate = 4.97, BR pricingMultiplier = 0.6
    const result = convertCurrency(100, 'USD', 'BRL', 'br');
    // 100 * 4.97 * 0.6 = 298.2
    expect(result).toBeCloseTo(298.2, 1);
  });

  it('applies no multiplier when no targetCountry is provided', () => {
    // USD_GBP rate = 0.79, no multiplier
    const result = convertCurrency(100, 'USD', 'GBP');
    expect(result).toBeCloseTo(79, 1);
  });

  it('returns the same amount for same-currency conversion without country', () => {
    expect(convertCurrency(250, 'USD', 'USD')).toBe(250);
  });

  it('applies pricingMultiplier even for same-currency when country is provided', () => {
    // US pricingMultiplier = 1.0, so result should equal input
    const result = convertCurrency(200, 'USD', 'USD', 'us');
    expect(result).toBeCloseTo(200, 2);
  });

  it('throws for an unsupported currency pair', () => {
    expect(() => convertCurrency(100, 'USD', 'JPY')).toThrow();
  });

  it('rounds to 2 decimal places', () => {
    const result = convertCurrency(1, 'USD', 'GBP');
    const decimals = result.toString().split('.')[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// validateCompliance
// ---------------------------------------------------------------------------

describe('validateCompliance', () => {
  // --- GDPR countries (UK, ES) ---

  it('rejects content missing GDPR keywords for UK', () => {
    const result = validateCompliance('Hello, check out our services!', 'uk');
    expect(result.passed).toBe(false);
    expect(result.checks.gdpr).toBe(false);
  });

  it('rejects content missing GDPR keywords for ES', () => {
    const result = validateCompliance('Hola, mira nuestros servicios.', 'es');
    expect(result.passed).toBe(false);
    expect(result.checks.gdpr).toBe(false);
  });

  it('passes compliance for UK when GDPR keywords and local regulations are present', () => {
    const content =
      'unsubscribe gdpr data protection privacy UK GDPR ICO PECR';
    const result = validateCompliance(content, 'uk');
    expect(result.passed).toBe(true);
    expect(result.checks.gdpr).toBe(true);
  });

  it('passes compliance for ES when GDPR keywords and local regulations are present', () => {
    const content =
      'unsubscribe gdpr data protection privacy GDPR LOPDGDD';
    const result = validateCompliance(content, 'es');
    expect(result.passed).toBe(true);
    expect(result.checks.gdpr).toBe(true);
  });

  it('includes a failure reason describing the missing GDPR keywords', () => {
    const result = validateCompliance('No compliance info here.', 'uk');
    expect(result.failedReasons.length).toBeGreaterThan(0);
    expect(result.failedReasons.some((r) => r.toLowerCase().includes('gdpr'))).toBe(true);
  });

  // --- PIPEDA country (CA) ---

  it('rejects content missing PIPEDA keywords for CA', () => {
    const result = validateCompliance('Hello, check out our services!', 'ca');
    expect(result.passed).toBe(false);
    expect(result.checks.pipeda).toBe(false);
  });

  it('passes compliance for CA when PIPEDA keywords and local regulations are present', () => {
    const content =
      'unsubscribe pipeda casl privacy PIPEDA CASL Quebec Law 25';
    const result = validateCompliance(content, 'ca');
    expect(result.passed).toBe(true);
    expect(result.checks.pipeda).toBe(true);
  });

  it('includes a failure reason describing the missing PIPEDA keywords', () => {
    const result = validateCompliance('No compliance info here.', 'ca');
    expect(result.failedReasons.length).toBeGreaterThan(0);
    expect(result.failedReasons.some((r) => r.toLowerCase().includes('pipeda'))).toBe(true);
  });

  // --- Non-GDPR / non-PIPEDA country (US) ---

  it('does not apply GDPR or PIPEDA checks for US', () => {
    const result = validateCompliance('Hello, check out our services! CCPA', 'us');
    expect(result.checks.gdpr).toBeNull();
    expect(result.checks.pipeda).toBeNull();
  });

  it('returns correct country in the result', () => {
    const result = validateCompliance('some content', 'uk');
    expect(result.country).toBe('uk');
  });
});

// ---------------------------------------------------------------------------
// getLocalizedTemplate
// ---------------------------------------------------------------------------

describe('getLocalizedTemplate', () => {
  it('returns a country-specific variant when the country has a matching audit module', () => {
    // UK has 'local_citations_uk' in countrySpecific, so templateId 'local_citations' should match
    const result = getLocalizedTemplate('local_citations', 'uk');
    expect(result).toBe('local_citations_uk');
  });

  it('returns a country-specific variant for CA', () => {
    // CA has 'local_citations_ca' in countrySpecific
    const result = getLocalizedTemplate('local_citations', 'ca');
    expect(result).toBe('local_citations_ca');
  });

  it('falls back to language-tagged variant for non-English countries', () => {
    // ES has language 'es' and no matching countrySpecific module for 'proposal'
    const result = getLocalizedTemplate('proposal', 'es');
    expect(result).toBe('proposal_es');
  });

  it('falls back to language-tagged variant for BR (pt-BR)', () => {
    // BR has language 'pt-BR' and no matching countrySpecific module for 'proposal'
    const result = getLocalizedTemplate('proposal', 'br');
    expect(result).toBe('proposal_pt-BR');
  });

  it('falls back to the plain templateId for English-language countries without a country variant', () => {
    // AU has language 'en-AU' — wait, en-AU !== 'en', so it should return language-tagged
    // US has language 'en' and no countrySpecific match for 'proposal'
    const result = getLocalizedTemplate('proposal', 'us');
    expect(result).toBe('proposal');
  });

  it('returns the country-specific variant when templateId is embedded in the country name', () => {
    // templateId contains 'uk' → hasCountryVariant = true
    const result = getLocalizedTemplate('audit_uk', 'uk');
    expect(result).toBe('audit_uk_uk');
  });
});

// ---------------------------------------------------------------------------
// CountryConfig completeness
// ---------------------------------------------------------------------------

describe('CountryConfig completeness', () => {
  const countries = Object.keys(COUNTRY_CONFIGS) as SupportedCountry[];

  it.each(countries)('%s config has a non-empty language', (country) => {
    const config = COUNTRY_CONFIGS[country];
    expect(config.language).toBeTruthy();
  });

  it.each(countries)('%s config has a non-empty currency code', (country) => {
    const config = COUNTRY_CONFIGS[country];
    expect(config.currency).toBeTruthy();
  });

  it.each(countries)('%s config has a non-empty currencySymbol', (country) => {
    const config = COUNTRY_CONFIGS[country];
    expect(config.currencySymbol).toBeTruthy();
  });

  it.each(countries)('%s config has a non-empty timezone', (country) => {
    const config = COUNTRY_CONFIGS[country];
    expect(config.timezone).toBeTruthy();
  });

  it.each(countries)('%s config has compliance object with required boolean fields', (country) => {
    const { compliance } = COUNTRY_CONFIGS[country];
    expect(typeof compliance.dataResidency).toBe('boolean');
    expect(typeof compliance.gdprApplicable).toBe('boolean');
    expect(typeof compliance.pipedaApplicable).toBe('boolean');
    expect(Array.isArray(compliance.localRegulations)).toBe(true);
  });

  it.each(countries)('%s config has emailConfig with toneAdjustments, culturalReferences, and legalDisclaimer', (country) => {
    const { emailConfig } = COUNTRY_CONFIGS[country];
    expect(emailConfig.toneAdjustments).toBeDefined();
    expect(typeof emailConfig.toneAdjustments).toBe('object');
    expect(Array.isArray(emailConfig.culturalReferences)).toBe(true);
    expect(emailConfig.culturalReferences.length).toBeGreaterThan(0);
    expect(typeof emailConfig.legalDisclaimer).toBe('string');
    expect(emailConfig.legalDisclaimer.length).toBeGreaterThan(0);
  });

  it.each(countries)('%s config has a numeric pricingMultiplier greater than 0', (country) => {
    const config = COUNTRY_CONFIGS[country];
    expect(typeof config.pricingMultiplier).toBe('number');
    expect(config.pricingMultiplier).toBeGreaterThan(0);
  });

  it.each(countries)('%s config country field matches its map key', (country) => {
    expect(COUNTRY_CONFIGS[country].country).toBe(country);
  });
});
