/**
 * Country-specific configuration for multi-country pipeline support
 */

export type CountryCode = 'US' | 'UK' | 'CA';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  language: string;
  currency: string;
  currencySymbol: string;
  dataProviders: string[];
  complianceRequirements: string[];
  emailTemplates: Record<string, string>;
  priceMultiplier: number;
  timezone: string;
}

export interface CurrencyConversion {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
}

/**
 * Country configurations
 */
const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  US: {
    code: 'US',
    name: 'United States',
    language: 'en-US',
    currency: 'USD',
    currencySymbol: '$',
    dataProviders: ['google_maps', 'yelp', 'apollo', 'hunter', 'clearbit'],
    complianceRequirements: ['GDPR_NOT_REQUIRED', 'CCPA_COMPLIANT'],
    emailTemplates: {
      discovery: 'templates/us/discovery.html',
      outreach: 'templates/us/outreach.html',
      followup: 'templates/us/followup.html',
    },
    priceMultiplier: 1.0,
    timezone: 'America/New_York',
  },
  UK: {
    code: 'UK',
    name: 'United Kingdom',
    language: 'en-GB',
    currency: 'GBP',
    currencySymbol: '£',
    dataProviders: ['google_maps', 'apollo', 'hunter', 'clearbit'],
    complianceRequirements: ['GDPR_COMPLIANT', 'ICO_REGISTERED'],
    emailTemplates: {
      discovery: 'templates/uk/discovery.html',
      outreach: 'templates/uk/outreach.html',
      followup: 'templates/uk/followup.html',
    },
    priceMultiplier: 0.85,
    timezone: 'Europe/London',
  },
  CA: {
    code: 'CA',
    name: 'Canada',
    language: 'en-CA',
    currency: 'CAD',
    currencySymbol: 'C$',
    dataProviders: ['google_maps', 'apollo', 'hunter', 'clearbit'],
    complianceRequirements: ['PIPEDA_COMPLIANT', 'CASL_COMPLIANT'],
    emailTemplates: {
      discovery: 'templates/ca/discovery.html',
      outreach: 'templates/ca/outreach.html',
      followup: 'templates/ca/followup.html',
    },
    priceMultiplier: 0.9,
    timezone: 'America/Toronto',
  },
};

/**
 * Currency exchange rates (would be fetched from external service in production)
 */
const EXCHANGE_RATES: Record<string, number> = {
  'USD_to_GBP': 0.79,
  'USD_to_CAD': 1.36,
  'GBP_to_USD': 1.27,
  'GBP_to_CAD': 1.72,
  'CAD_to_USD': 0.74,
  'CAD_to_GBP': 0.58,
};

/**
 * Get country configuration by code
 */
export function getCountryConfig(countryCode: CountryCode): CountryConfig {
  const config = COUNTRY_CONFIGS[countryCode];
  if (!config) {
    throw new Error(`Unsupported country: ${countryCode}`);
  }
  return config;
}

/**
 * Detect country from prospect data
 */
export function detectCountry(prospectData: {
  city?: string;
  state?: string;
  country?: string;
  website?: string;
}): CountryCode {
  // If country is explicitly provided
  if (prospectData.country) {
    const code = prospectData.country.toUpperCase();
    if (code === 'US' || code === 'UK' || code === 'CA') {
      return code as CountryCode;
    }
  }

  // Detect from state/province
  if (prospectData.state) {
    const state = prospectData.state.toUpperCase();
    // US states
    if (['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'].includes(state)) {
      return 'US';
    }
    // Canadian provinces
    if (['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'PE', 'NL'].includes(state)) {
      return 'CA';
    }
  }

  // Detect from website domain
  if (prospectData.website) {
    if (prospectData.website.includes('.uk')) return 'UK';
    if (prospectData.website.includes('.ca')) return 'CA';
    if (prospectData.website.includes('.com') || prospectData.website.includes('.us')) return 'US';
  }

  // Default to US
  return 'US';
}

/**
 * Convert currency amount
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const rateKey = `${fromCurrency}_to_${toCurrency}`;
  const rate = EXCHANGE_RATES[rateKey];

  if (!rate) {
    throw new Error(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
  }

  return Math.round(amount * rate * 100) / 100;
}

/**
 * Apply country-specific pricing multiplier
 */
export function applyCountryPricing(basePrice: number, countryCode: CountryCode): number {
  const config = getCountryConfig(countryCode);
  return Math.round(basePrice * config.priceMultiplier * 100) / 100;
}

/**
 * Get email template for country
 */
export function getEmailTemplate(countryCode: CountryCode, templateType: string): string {
  const config = getCountryConfig(countryCode);
  return config.emailTemplates[templateType] || config.emailTemplates['outreach'];
}

/**
 * Get data providers for country
 */
export function getDataProviders(countryCode: CountryCode): string[] {
  const config = getCountryConfig(countryCode);
  return config.dataProviders;
}

/**
 * Check compliance requirements
 */
export function getComplianceRequirements(countryCode: CountryCode): string[] {
  const config = getCountryConfig(countryCode);
  return config.complianceRequirements;
}

/**
 * Get timezone for country
 */
export function getTimezone(countryCode: CountryCode): string {
  const config = getCountryConfig(countryCode);
  return config.timezone;
}

/**
 * Get all supported countries
 */
export function getSupportedCountries(): CountryConfig[] {
  return Object.values(COUNTRY_CONFIGS);
}

/**
 * Validate country code
 */
export function isValidCountryCode(code: string): code is CountryCode {
  return code === 'US' || code === 'UK' || code === 'CA';
}
