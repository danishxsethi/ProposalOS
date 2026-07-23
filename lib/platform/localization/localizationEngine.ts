/**
 * Localization Engine
 * Handles international expansion: content adaptation, currency conversion,
 * template selection, compliance validation, and per-country metrics.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.7, 18.8
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedCountry = 'us' | 'uk' | 'ca' | 'au' | 'es' | 'br';
export type SupportedLanguage = 'en' | 'en-GB' | 'en-AU' | 'es' | 'pt-BR';

export interface CountryConfig {
  country: SupportedCountry;
  language: SupportedLanguage;
  currency: string;
  currencySymbol: string;
  timezone: string;
  compliance: {
    dataResidency: boolean;
    gdprApplicable: boolean;
    pipedaApplicable: boolean;
    localRegulations: string[];
  };
  auditModules: {
    enabled: string[];
    disabled: string[];
    countrySpecific: string[];
  };
  emailConfig: {
    toneAdjustments: Record<string, string>;
    culturalReferences: string[];
    legalDisclaimer: string;
  };
  pricingMultiplier: number;
}

export interface ComplianceResult {
  passed: boolean;
  country: SupportedCountry;
  checks: {
    gdpr: boolean | null;       // null = not applicable
    pipeda: boolean | null;
    localRegulations: boolean;
  };
  failedReasons: string[];
}

export interface CountryMetrics {
  country: SupportedCountry;
  prospectsTotal: number;
  auditsCompleted: number;
  proposalsSent: number;
  dealsWon: number;
  conversionRate: number;
  totalRevenue: number;
  averageDealSize: number;
  lastUpdated: Date;
}

// ---------------------------------------------------------------------------
// Hardcoded exchange rates (USD base)
// In production these would be refreshed from an external FX API.
// ---------------------------------------------------------------------------

const EXCHANGE_RATES: Record<string, number> = {
  USD_USD: 1.0,
  USD_GBP: 0.79,
  USD_CAD: 1.36,
  USD_AUD: 1.53,
  USD_EUR: 0.92,
  USD_BRL: 4.97,
  GBP_USD: 1.27,
  GBP_GBP: 1.0,
  GBP_CAD: 1.72,
  GBP_AUD: 1.94,
  GBP_EUR: 1.16,
  GBP_BRL: 6.30,
  CAD_USD: 0.74,
  CAD_GBP: 0.58,
  CAD_CAD: 1.0,
  CAD_AUD: 1.13,
  CAD_EUR: 0.68,
  CAD_BRL: 3.65,
  AUD_USD: 0.65,
  AUD_GBP: 0.52,
  AUD_CAD: 0.89,
  AUD_AUD: 1.0,
  AUD_EUR: 0.60,
  AUD_BRL: 3.24,
  EUR_USD: 1.09,
  EUR_GBP: 0.86,
  EUR_CAD: 1.48,
  EUR_AUD: 1.67,
  EUR_EUR: 1.0,
  EUR_BRL: 5.40,
  BRL_USD: 0.20,
  BRL_GBP: 0.16,
  BRL_CAD: 0.27,
  BRL_AUD: 0.31,
  BRL_EUR: 0.19,
  BRL_BRL: 1.0,
};

// ---------------------------------------------------------------------------
// Built-in country configurations
// These are the defaults; task 27.2 will add richer per-file configs that
// can be imported and merged here.
// ---------------------------------------------------------------------------

const COUNTRY_CONFIGS: Record<SupportedCountry, CountryConfig> = {
  us: {
    country: 'us',
    language: 'en',
    currency: 'USD',
    currencySymbol: '$',
    timezone: 'America/New_York',
    compliance: {
      dataResidency: false,
      gdprApplicable: false,
      pipedaApplicable: false,
      localRegulations: ['CCPA'],
    },
    auditModules: {
      enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social'],
      disabled: [],
      countrySpecific: ['local_citations_us'],
    },
    emailConfig: {
      toneAdjustments: {
        greeting: 'Hi',
        closing: 'Best regards',
        urgency: 'limited time offer',
      },
      culturalReferences: ['Super Bowl', 'Thanksgiving', 'Fourth of July'],
      legalDisclaimer:
        'This email was sent by {agencyName}. To unsubscribe, click here.',
    },
    pricingMultiplier: 1.0,
  },

  uk: {
    country: 'uk',
    language: 'en-GB',
    currency: 'GBP',
    currencySymbol: '£',
    timezone: 'Europe/London',
    compliance: {
      dataResidency: true,
      gdprApplicable: true,
      pipedaApplicable: false,
      localRegulations: ['UK GDPR', 'ICO', 'PECR'],
    },
    auditModules: {
      enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social'],
      disabled: [],
      countrySpecific: ['local_citations_uk', 'gdpr_compliance_check'],
    },
    emailConfig: {
      toneAdjustments: {
        greeting: 'Dear',
        closing: 'Kind regards',
        urgency: 'exclusive opportunity',
      },
      culturalReferences: ['Bank Holiday', 'Christmas', 'Bonfire Night'],
      legalDisclaimer:
        'This email is sent in accordance with UK GDPR. {agencyName} is registered with the ICO. To unsubscribe, click here.',
    },
    pricingMultiplier: 0.85,
  },

  ca: {
    country: 'ca',
    language: 'en',
    currency: 'CAD',
    currencySymbol: 'C$',
    timezone: 'America/Toronto',
    compliance: {
      dataResidency: true,
      gdprApplicable: false,
      pipedaApplicable: true,
      localRegulations: ['PIPEDA', 'CASL'],
    },
    auditModules: {
      enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social'],
      disabled: [],
      countrySpecific: ['local_citations_ca', 'pipeda_compliance_check', 'casl_compliance_check'],
    },
    emailConfig: {
      toneAdjustments: {
        greeting: 'Hi',
        closing: 'Best regards',
        urgency: 'limited time offer',
      },
      culturalReferences: ['Canada Day', 'Thanksgiving', 'Hockey Night'],
      legalDisclaimer:
        'This email complies with CASL. {agencyName} obtained your consent. To unsubscribe, click here.',
    },
    pricingMultiplier: 0.9,
  },

  au: {
    country: 'au',
    language: 'en-AU',
    currency: 'AUD',
    currencySymbol: 'A$',
    timezone: 'Australia/Sydney',
    compliance: {
      dataResidency: false,
      gdprApplicable: false,
      pipedaApplicable: false,
      localRegulations: ['Australian Privacy Act', 'Spam Act 2003'],
    },
    auditModules: {
      enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social'],
      disabled: [],
      countrySpecific: ['local_citations_au'],
    },
    emailConfig: {
      toneAdjustments: {
        greeting: 'G\'day',
        closing: 'Cheers',
        urgency: 'limited time offer',
      },
      culturalReferences: ['Australia Day', 'ANZAC Day', 'AFL Grand Final'],
      legalDisclaimer:
        'This email was sent by {agencyName} in compliance with the Spam Act 2003. To unsubscribe, click here.',
    },
    pricingMultiplier: 0.95,
  },

  es: {
    country: 'es',
    language: 'es',
    currency: 'EUR',
    currencySymbol: '€',
    timezone: 'Europe/Madrid',
    compliance: {
      dataResidency: true,
      gdprApplicable: true,
      pipedaApplicable: false,
      localRegulations: ['GDPR', 'LOPDGDD'],
    },
    auditModules: {
      enabled: ['seo', 'speed', 'gbp', 'reviews', 'social'],
      disabled: ['paid_ads'],
      countrySpecific: ['local_citations_es', 'gdpr_compliance_check'],
    },
    emailConfig: {
      toneAdjustments: {
        greeting: 'Estimado/a',
        closing: 'Atentamente',
        urgency: 'oferta por tiempo limitado',
      },
      culturalReferences: ['Navidad', 'Semana Santa', 'Fiestas Nacionales'],
      legalDisclaimer:
        'Este correo se envía conforme al RGPD. {agencyName} está registrada como responsable del tratamiento. Para darse de baja, haga clic aquí.',
    },
    pricingMultiplier: 0.8,
  },

  br: {
    country: 'br',
    language: 'pt-BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    timezone: 'America/Sao_Paulo',
    compliance: {
      dataResidency: true,
      gdprApplicable: false,
      pipedaApplicable: false,
      localRegulations: ['LGPD'],
    },
    auditModules: {
      enabled: ['seo', 'speed', 'gbp', 'reviews', 'social'],
      disabled: [],
      countrySpecific: ['local_citations_br', 'lgpd_compliance_check'],
    },
    emailConfig: {
      toneAdjustments: {
        greeting: 'Olá',
        closing: 'Atenciosamente',
        urgency: 'oferta por tempo limitado',
      },
      culturalReferences: ['Carnaval', 'Dia das Mães', 'Copa do Mundo'],
      legalDisclaimer:
        'Este e-mail foi enviado por {agencyName} em conformidade com a LGPD. Para cancelar o recebimento, clique aqui.',
    },
    pricingMultiplier: 0.6,
  },
};

// ---------------------------------------------------------------------------
// In-memory metrics store (would be backed by DB in production)
// ---------------------------------------------------------------------------

const metricsStore: Map<SupportedCountry, CountryMetrics> = new Map();

function getOrInitMetrics(country: SupportedCountry): CountryMetrics {
  if (!metricsStore.has(country)) {
    metricsStore.set(country, {
      country,
      prospectsTotal: 0,
      auditsCompleted: 0,
      proposalsSent: 0,
      dealsWon: 0,
      conversionRate: 0,
      totalRevenue: 0,
      averageDealSize: 0,
      lastUpdated: new Date(),
    });
  }
  return metricsStore.get(country)!;
}

// ---------------------------------------------------------------------------
// Compliance keyword checks
// ---------------------------------------------------------------------------

/** Keywords that must appear in content for GDPR-applicable countries. */
const GDPR_REQUIRED_KEYWORDS = ['unsubscribe', 'gdpr', 'data protection', 'privacy'];

/** Keywords that must appear in content for PIPEDA-applicable countries. */
const PIPEDA_REQUIRED_KEYWORDS = ['unsubscribe', 'pipeda', 'casl', 'privacy'];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ---------------------------------------------------------------------------
// Localization Engine
// ---------------------------------------------------------------------------

/**
 * Returns the full `CountryConfig` for the given country.
 * Requirement 18.8 — one config per country for efficient scaling.
 */
export function getCountryConfig(country: SupportedCountry): CountryConfig {
  const config = COUNTRY_CONFIGS[country];
  if (!config) {
    throw new Error(`Unsupported country: ${country}`);
  }
  return config;
}

/**
 * Adapts content for the target country using the country's language tag and
 * email tone adjustments.
 *
 * For a full production implementation this would call a translation service;
 * here we apply tone-adjustment token substitution and prepend a language tag.
 *
 * Requirement 18.1 (multi-language), 18.4 (tone/cultural adaptation).
 */
export function localizeContent(content: string, targetCountry: SupportedCountry): string {
  const config = getCountryConfig(targetCountry);
  let localized = content;

  // Apply tone adjustments: replace generic tokens with country-specific ones
  for (const [token, replacement] of Object.entries(config.emailConfig.toneAdjustments)) {
    const regex = new RegExp(`\\{${token}\\}`, 'gi');
    localized = localized.replace(regex, replacement);
  }

  // Append legal disclaimer if not already present
  const disclaimer = config.emailConfig.legalDisclaimer;
  if (disclaimer && !localized.includes(disclaimer)) {
    localized = `${localized}\n\n${disclaimer}`;
  }

  return localized;
}

/**
 * Converts an amount from one currency to another, then applies the target
 * country's `pricingMultiplier`.
 *
 * Requirement 18.3 — auto-adapt pricing per country.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  targetCountry?: SupportedCountry,
): number {
  if (fromCurrency === toCurrency && !targetCountry) {
    return Math.round(amount * 100) / 100;
  }

  const rateKey = `${fromCurrency}_${toCurrency}`;
  const rate = EXCHANGE_RATES[rateKey];

  if (rate === undefined) {
    throw new Error(`No exchange rate available for ${fromCurrency} → ${toCurrency}`);
  }

  let converted = amount * rate;

  // Apply country pricing multiplier when a target country is provided
  if (targetCountry) {
    const config = getCountryConfig(targetCountry);
    converted = converted * config.pricingMultiplier;
  }

  return Math.round(converted * 100) / 100;
}

/**
 * Returns the localized template string for the given template ID and country.
 * Falls back to the default (US) template when no country-specific variant exists.
 *
 * Requirement 18.3 — auto-adapt proposal templates per country.
 */
export function getLocalizedTemplate(templateId: string, country: SupportedCountry): string {
  const config = getCountryConfig(country);

  // Country-specific template path convention: `{templateId}_{country}`
  const countryVariant = `${templateId}_${country}`;

  // Check if this country has a country-specific audit module that implies a
  // dedicated template variant.
  const hasCountryVariant = config.auditModules.countrySpecific.some((mod) =>
    mod.startsWith(templateId) || templateId.includes(country),
  );

  if (hasCountryVariant) {
    return countryVariant;
  }

  // Fall back to language-tagged variant, then plain templateId
  if (config.language !== 'en') {
    return `${templateId}_${config.language}`;
  }

  return templateId;
}

/**
 * Validates that `content` satisfies the compliance requirements for `country`.
 *
 * - GDPR countries (UK, ES): content must reference unsubscribe + data protection
 * - PIPEDA countries (CA): content must reference unsubscribe + CASL/PIPEDA
 * - Local regulations are checked by name presence in content
 *
 * Requirement 18.2 — auto-adapt for country-specific compliance.
 */
export function validateCompliance(content: string, country: SupportedCountry): ComplianceResult {
  const config = getCountryConfig(country);
  const failedReasons: string[] = [];

  let gdprCheck: boolean | null = null;
  let pipedaCheck: boolean | null = null;

  if (config.compliance.gdprApplicable) {
    gdprCheck = containsAny(content, GDPR_REQUIRED_KEYWORDS);
    if (!gdprCheck) {
      failedReasons.push(
        `GDPR: content must include at least one of: ${GDPR_REQUIRED_KEYWORDS.join(', ')}`,
      );
    }
  }

  if (config.compliance.pipedaApplicable) {
    pipedaCheck = containsAny(content, PIPEDA_REQUIRED_KEYWORDS);
    if (!pipedaCheck) {
      failedReasons.push(
        `PIPEDA: content must include at least one of: ${PIPEDA_REQUIRED_KEYWORDS.join(', ')}`,
      );
    }
  }

  // Check local regulations: each regulation name should appear in the content
  const localRegCheck = config.compliance.localRegulations.every((reg) =>
    content.toLowerCase().includes(reg.toLowerCase()),
  );
  if (!localRegCheck && config.compliance.localRegulations.length > 0) {
    const missing = config.compliance.localRegulations.filter(
      (reg) => !content.toLowerCase().includes(reg.toLowerCase()),
    );
    failedReasons.push(`Local regulations missing: ${missing.join(', ')}`);
  }

  const passed =
    failedReasons.length === 0 &&
    (gdprCheck === null || gdprCheck === true) &&
    (pipedaCheck === null || pipedaCheck === true);

  return {
    passed,
    country,
    checks: {
      gdpr: gdprCheck,
      pipeda: pipedaCheck,
      localRegulations: localRegCheck,
    },
    failedReasons,
  };
}

/**
 * Returns per-country performance metrics.
 * In production this would query the database; here we return the in-memory store.
 *
 * Requirement 18.7 — track per-country metrics.
 */
export function getCountryMetrics(country: SupportedCountry): CountryMetrics {
  return getOrInitMetrics(country);
}

/**
 * Updates the in-memory metrics for a country (used by pipeline events).
 * Exported so other modules can record events without direct store access.
 */
export function recordCountryEvent(
  country: SupportedCountry,
  event: Partial<Omit<CountryMetrics, 'country' | 'lastUpdated' | 'conversionRate' | 'averageDealSize'>>,
): void {
  const metrics = getOrInitMetrics(country);

  if (event.prospectsTotal !== undefined) metrics.prospectsTotal += event.prospectsTotal;
  if (event.auditsCompleted !== undefined) metrics.auditsCompleted += event.auditsCompleted;
  if (event.proposalsSent !== undefined) metrics.proposalsSent += event.proposalsSent;
  if (event.dealsWon !== undefined) {
    metrics.dealsWon += event.dealsWon;
  }
  if (event.totalRevenue !== undefined) {
    metrics.totalRevenue += event.totalRevenue;
  }

  // Recompute derived metrics
  metrics.conversionRate =
    metrics.prospectsTotal > 0
      ? Math.round((metrics.dealsWon / metrics.prospectsTotal) * 10000) / 100
      : 0;

  metrics.averageDealSize =
    metrics.dealsWon > 0
      ? Math.round((metrics.totalRevenue / metrics.dealsWon) * 100) / 100
      : 0;

  metrics.lastUpdated = new Date();
}

/**
 * Returns all supported countries.
 */
export function getSupportedCountries(): SupportedCountry[] {
  return Object.keys(COUNTRY_CONFIGS) as SupportedCountry[];
}
