import { CountryConfig } from '../localizationEngine';

export const ukConfig: CountryConfig = {
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
    enabled: ['seo', 'speed', 'gbp', 'reviews', 'paid_ads', 'social', 'local_citations'],
    disabled: [],
    countrySpecific: [
      'local_citations_uk',
      'gdpr_compliance_check',
      'ico_registration_check',
      'google_ads_uk',
    ],
  },
  emailConfig: {
    toneAdjustments: {
      greeting: 'Dear',
      closing: 'Kind regards',
      urgency: 'exclusive opportunity',
      callToAction: 'Get in touch',
      subjectPrefix: '',
    },
    culturalReferences: [
      'Bank Holiday',
      'Christmas',
      'Bonfire Night',
      'Easter',
      'Jubilee',
    ],
    legalDisclaimer:
      'This email is sent in accordance with UK GDPR. {agencyName} is registered with the ICO (Registration No. {icoNumber}). You have the right to access, rectify, or erase your personal data. To unsubscribe, click here.',
  },
  pricingMultiplier: 0.85,
};
