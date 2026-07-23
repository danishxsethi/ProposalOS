import { CountryConfig } from '../localizationEngine';

export const brConfig: CountryConfig = {
  country: 'br',
  language: 'pt-BR',
  currency: 'BRL',
  currencySymbol: 'R$',
  timezone: 'America/Sao_Paulo',
  compliance: {
    dataResidency: true,
    gdprApplicable: false,
    pipedaApplicable: false,
    localRegulations: ['LGPD', 'Marco Civil da Internet'],
  },
  auditModules: {
    enabled: ['seo', 'speed', 'gbp', 'reviews', 'social', 'local_citations'],
    disabled: [],
    countrySpecific: [
      'local_citations_br',
      'lgpd_compliance_check',
      'google_meu_negocio_br',
      'reclame_aqui_br',
    ],
  },
  emailConfig: {
    toneAdjustments: {
      greeting: 'Olá',
      closing: 'Atenciosamente',
      urgency: 'oferta por tempo limitado',
      callToAction: 'Comece hoje',
      subjectPrefix: '',
    },
    culturalReferences: [
      'Carnaval',
      'Dia das Mães',
      'Copa do Mundo',
      'Dia dos Namorados',
      'Black Friday',
    ],
    legalDisclaimer:
      'Este e-mail foi enviado por {agencyName} em conformidade com a Lei Geral de Proteção de Dados (LGPD). Você tem o direito de acessar, corrigir ou excluir seus dados pessoais. Para cancelar o recebimento deste e-mail, clique aqui. {agencyName}, {agencyAddress}.',
  },
  pricingMultiplier: 0.6,
};
