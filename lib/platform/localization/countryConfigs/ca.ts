import { CountryConfig } from '../localizationEngine';

export const caConfig: CountryConfig = {
  country: 'ca',
  language: 'en',
  currency: 'CAD',
  currencySymbol: 'C$',
  timezone: 'America/Toronto',
  compliance: {
    dataResidency: true,
    gdprApplicable: false,
    pipedaApplicable: true,
    localRegulations: ['PIPEDA', 'CASL', 'Quebec Law 25'],
  },
  auditModules: {
    enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social', 'local_citations'],
    disabled: [],
    countrySpecific: [
      'local_citations_ca',
      'pipeda_compliance_check',
      'casl_compliance_check',
      'google_ads_ca',
      'bilingual_content_check',
    ],
  },
  emailConfig: {
    toneAdjustments: {
      greeting: 'Hi',
      closing: 'Best regards',
      urgency: 'limited time offer',
      callToAction: 'Get started today',
      subjectPrefix: '',
    },
    culturalReferences: [
      'Canada Day',
      'Thanksgiving',
      'Hockey Night',
      'Victoria Day',
      'Remembrance Day',
    ],
    legalDisclaimer:
      'This email complies with CASL. {agencyName} obtained your express or implied consent to send commercial electronic messages. You may withdraw consent at any time. To unsubscribe, click here. {agencyName}, {agencyAddress}.',
  },
  pricingMultiplier: 0.9,
};
