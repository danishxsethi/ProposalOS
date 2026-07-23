import { CountryConfig } from '../localizationEngine';

export const esConfig: CountryConfig = {
  country: 'es',
  language: 'es',
  currency: 'EUR',
  currencySymbol: '€',
  timezone: 'Europe/Madrid',
  compliance: {
    dataResidency: true,
    gdprApplicable: true,
    pipedaApplicable: false,
    localRegulations: ['GDPR', 'LOPDGDD', 'LSSI-CE'],
  },
  auditModules: {
    enabled: ['seo', 'speed', 'gbp', 'reviews', 'social', 'local_citations'],
    disabled: ['paid_ads'],
    countrySpecific: [
      'local_citations_es',
      'gdpr_compliance_check',
      'lopdgdd_compliance_check',
      'google_my_business_es',
    ],
  },
  emailConfig: {
    toneAdjustments: {
      greeting: 'Estimado/a',
      closing: 'Atentamente',
      urgency: 'oferta por tiempo limitado',
      callToAction: 'Empiece hoy',
      subjectPrefix: '',
    },
    culturalReferences: [
      'Navidad',
      'Semana Santa',
      'Fiestas Nacionales',
      'Día de la Hispanidad',
      'Reyes Magos',
    ],
    legalDisclaimer:
      'Este correo electrónico se envía conforme al Reglamento General de Protección de Datos (RGPD) y la LOPDGDD. {agencyName} está registrada como responsable del tratamiento de datos. Tiene derecho a acceder, rectificar o suprimir sus datos. Para darse de baja, haga clic aquí.',
  },
  pricingMultiplier: 0.8,
};
