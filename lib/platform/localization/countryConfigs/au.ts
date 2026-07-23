import { CountryConfig } from '../localizationEngine';

export const auConfig: CountryConfig = {
  country: 'au',
  language: 'en-AU',
  currency: 'AUD',
  currencySymbol: 'A$',
  timezone: 'Australia/Sydney',
  compliance: {
    dataResidency: false,
    gdprApplicable: false,
    pipedaApplicable: false,
    localRegulations: ['Australian Privacy Act', 'Spam Act 2003', 'Australian Consumer Law'],
  },
  auditModules: {
    enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social', 'local_citations'],
    disabled: [],
    countrySpecific: [
      'local_citations_au',
      'google_ads_au',
      'true_local_au',
      'yellow_pages_au',
    ],
  },
  emailConfig: {
    toneAdjustments: {
      greeting: "G'day",
      closing: 'Cheers',
      urgency: 'limited time offer',
      callToAction: 'Get started today',
      subjectPrefix: '',
    },
    culturalReferences: [
      'Australia Day',
      'ANZAC Day',
      'AFL Grand Final',
      'Melbourne Cup',
      'Christmas in Summer',
    ],
    legalDisclaimer:
      'This email was sent by {agencyName} in compliance with the Spam Act 2003. You are receiving this because you have a business relationship with us or have opted in. To unsubscribe, click here. {agencyName}, {agencyAddress}.',
  },
  pricingMultiplier: 0.95,
};
