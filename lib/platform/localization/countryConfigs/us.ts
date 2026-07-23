import { CountryConfig } from '../localizationEngine';

export const usConfig: CountryConfig = {
  country: 'us',
  language: 'en',
  currency: 'USD',
  currencySymbol: '$',
  timezone: 'America/New_York',
  compliance: {
    dataResidency: false,
    gdprApplicable: false,
    pipedaApplicable: false,
    localRegulations: ['CCPA', 'CAN-SPAM'],
  },
  auditModules: {
    enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social', 'local_citations'],
    disabled: [],
    countrySpecific: ['local_citations_us', 'google_ads_us', 'yelp_us'],
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
      'Super Bowl',
      'Thanksgiving',
      'Fourth of July',
      'Labor Day',
      'Memorial Day',
    ],
    legalDisclaimer:
      'This email was sent by {agencyName}. You are receiving this because you expressed interest in our services. To unsubscribe, click here. {agencyName}, {agencyAddress}.',
  },
  pricingMultiplier: 1.0,
};
