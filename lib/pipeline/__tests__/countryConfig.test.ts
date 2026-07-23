import { describe, it, expect } from 'vitest';
import {
  getCountryConfig,
  detectCountry,
  convertCurrency,
  applyCountryPricing,
  getEmailTemplate,
  getDataProviders,
  getComplianceRequirements,
  getTimezone,
  getSupportedCountries,
  isValidCountryCode,
  CountryCode,
} from '../countryConfig';

describe('Country Configuration', () => {
  describe('getCountryConfig', () => {
    it('should return US configuration', () => {
      const config = getCountryConfig('US');
      expect(config.code).toBe('US');
      expect(config.currency).toBe('USD');
      expect(config.language).toBe('en-US');
    });

    it('should return UK configuration', () => {
      const config = getCountryConfig('UK');
      expect(config.code).toBe('UK');
      expect(config.currency).toBe('GBP');
      expect(config.language).toBe('en-GB');
    });

    it('should return CA configuration', () => {
      const config = getCountryConfig('CA');
      expect(config.code).toBe('CA');
      expect(config.currency).toBe('CAD');
      expect(config.language).toBe('en-CA');
    });

    it('should throw error for unsupported country', () => {
      expect(() => getCountryConfig('FR' as CountryCode)).toThrow('Unsupported country');
    });
  });

  describe('detectCountry', () => {
    it('should detect US from explicit country', () => {
      const country = detectCountry({ country: 'US' });
      expect(country).toBe('US');
    });

    it('should detect UK from explicit country', () => {
      const country = detectCountry({ country: 'UK' });
      expect(country).toBe('UK');
    });

    it('should detect CA from explicit country', () => {
      const country = detectCountry({ country: 'CA' });
      expect(country).toBe('CA');
    });

    it('should detect US from state code', () => {
      const country = detectCountry({ state: 'NY' });
      expect(country).toBe('US');
    });

    it('should detect CA from province code', () => {
      const country = detectCountry({ state: 'ON' });
      expect(country).toBe('CA');
    });

    it('should detect UK from website domain', () => {
      const country = detectCountry({ website: 'https://example.uk' });
      expect(country).toBe('UK');
    });

    it('should detect CA from website domain', () => {
      const country = detectCountry({ website: 'https://example.ca' });
      expect(country).toBe('CA');
    });

    it('should default to US when no data provided', () => {
      const country = detectCountry({});
      expect(country).toBe('US');
    });
  });

  describe('convertCurrency', () => {
    it('should convert USD to GBP', () => {
      const result = convertCurrency(100, 'USD', 'GBP');
      expect(result).toBe(79);
    });

    it('should convert GBP to USD', () => {
      const result = convertCurrency(100, 'GBP', 'USD');
      expect(result).toBe(127);
    });

    it('should convert USD to CAD', () => {
      const result = convertCurrency(100, 'USD', 'CAD');
      expect(result).toBe(136);
    });

    it('should return same amount for same currency', () => {
      const result = convertCurrency(100, 'USD', 'USD');
      expect(result).toBe(100);
    });

    it('should throw error for unsupported conversion', () => {
      expect(() => convertCurrency(100, 'USD', 'EUR')).toThrow('No exchange rate found');
    });
  });

  describe('applyCountryPricing', () => {
    it('should apply US pricing multiplier (1.0)', () => {
      const result = applyCountryPricing(1000, 'US');
      expect(result).toBe(1000);
    });

    it('should apply UK pricing multiplier (0.85)', () => {
      const result = applyCountryPricing(1000, 'UK');
      expect(result).toBe(850);
    });

    it('should apply CA pricing multiplier (0.9)', () => {
      const result = applyCountryPricing(1000, 'CA');
      expect(result).toBe(900);
    });
  });

  describe('getEmailTemplate', () => {
    it('should return US outreach template', () => {
      const template = getEmailTemplate('US', 'outreach');
      expect(template).toContain('templates/us');
    });

    it('should return UK outreach template', () => {
      const template = getEmailTemplate('UK', 'outreach');
      expect(template).toContain('templates/uk');
    });

    it('should return CA outreach template', () => {
      const template = getEmailTemplate('CA', 'outreach');
      expect(template).toContain('templates/ca');
    });

    it('should return default template for unknown type', () => {
      const template = getEmailTemplate('US', 'unknown');
      expect(template).toBeDefined();
    });
  });

  describe('getDataProviders', () => {
    it('should return US data providers', () => {
      const providers = getDataProviders('US');
      expect(providers).toContain('google_maps');
      expect(providers).toContain('yelp');
    });

    it('should return UK data providers', () => {
      const providers = getDataProviders('UK');
      expect(providers).toContain('google_maps');
      expect(providers).not.toContain('yelp');
    });

    it('should return CA data providers', () => {
      const providers = getDataProviders('CA');
      expect(providers).toContain('google_maps');
    });
  });

  describe('getComplianceRequirements', () => {
    it('should return US compliance requirements', () => {
      const requirements = getComplianceRequirements('US');
      expect(requirements).toContain('CCPA_COMPLIANT');
    });

    it('should return UK compliance requirements', () => {
      const requirements = getComplianceRequirements('UK');
      expect(requirements).toContain('GDPR_COMPLIANT');
    });

    it('should return CA compliance requirements', () => {
      const requirements = getComplianceRequirements('CA');
      expect(requirements).toContain('PIPEDA_COMPLIANT');
      expect(requirements).toContain('CASL_COMPLIANT');
    });
  });

  describe('getTimezone', () => {
    it('should return US timezone', () => {
      const tz = getTimezone('US');
      expect(tz).toBe('America/New_York');
    });

    it('should return UK timezone', () => {
      const tz = getTimezone('UK');
      expect(tz).toBe('Europe/London');
    });

    it('should return CA timezone', () => {
      const tz = getTimezone('CA');
      expect(tz).toBe('America/Toronto');
    });
  });

  describe('getSupportedCountries', () => {
    it('should return all supported countries', () => {
      const countries = getSupportedCountries();
      expect(countries.length).toBe(3);
      expect(countries.map((c) => c.code)).toContain('US');
      expect(countries.map((c) => c.code)).toContain('UK');
      expect(countries.map((c) => c.code)).toContain('CA');
    });
  });

  describe('isValidCountryCode', () => {
    it('should validate US', () => {
      expect(isValidCountryCode('US')).toBe(true);
    });

    it('should validate UK', () => {
      expect(isValidCountryCode('UK')).toBe(true);
    });

    it('should validate CA', () => {
      expect(isValidCountryCode('CA')).toBe(true);
    });

    it('should reject invalid country', () => {
      expect(isValidCountryCode('FR')).toBe(false);
    });
  });
});
