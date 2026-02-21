/**
 * RegulatoryComplianceChecker
 *
 * Flags recommendations that may violate local regulations and provides
 * compliant alternatives.
 *
 * Supported regulations:
 *  - GDPR  → EU locales: de-DE, fr-FR, es-ES
 *  - PIPEDA → Canada: en-CA
 *  - Privacy Act → Australia: en-AU
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 15.2, 15.3, 15.4, 15.5
 */

import { RegulatoryFlag, RegulatoryRule, RegulatoryConfig, ComplianceReport } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Recommendation types that may trigger regulatory flags. */
const REGULATED_RECOMMENDATION_TYPES = new Set([
  'data_collection',
  'user_tracking',
  'cookie_usage',
  'email_marketing',
  'behavioral_targeting',
]);

/** EU locales subject to GDPR. */
const EU_LOCALES = new Set(['de-DE', 'fr-FR', 'es-ES']);

// ---------------------------------------------------------------------------
// Regulatory rule definitions
// ---------------------------------------------------------------------------

const GDPR_RULES: Omit<RegulatoryRule, 'locale'>[] = [
  {
    id: 'gdpr-data-collection',
    regulation: 'GDPR',
    applicableRecommendationTypes: ['data_collection'],
    complianceRequirements: [
      'Obtain explicit user consent before collecting personal data (Art. 6)',
      'Provide clear privacy notice explaining data use (Art. 13)',
      'Allow users to withdraw consent at any time (Art. 7)',
      'Implement data minimisation — collect only what is necessary (Art. 5)',
    ],
    suggestedAlternatives: [
      'Implement a consent management platform (CMP) before data collection',
      'Use anonymised or aggregated analytics instead of personal data',
      'Provide opt-in mechanisms with granular consent options',
    ],
  },
  {
    id: 'gdpr-user-tracking',
    regulation: 'GDPR',
    applicableRecommendationTypes: ['user_tracking'],
    complianceRequirements: [
      'Obtain explicit consent before tracking user behaviour (Art. 6)',
      'Disclose tracking in privacy policy (Art. 13)',
      'Provide opt-out mechanism for tracking (Art. 21)',
      'Conduct Data Protection Impact Assessment (DPIA) if high-risk (Art. 35)',
    ],
    suggestedAlternatives: [
      'Use privacy-preserving analytics (e.g., server-side, cookieless)',
      'Implement tracking only after explicit user consent',
      'Use aggregated cohort analysis instead of individual tracking',
    ],
  },
  {
    id: 'gdpr-cookie-usage',
    regulation: 'GDPR',
    applicableRecommendationTypes: ['cookie_usage'],
    complianceRequirements: [
      'Display cookie consent banner before setting non-essential cookies (ePrivacy Directive)',
      'Categorise cookies (strictly necessary, functional, analytics, marketing)',
      'Allow users to accept or reject cookie categories individually',
      'Record and store user consent decisions',
    ],
    suggestedAlternatives: [
      'Use a GDPR-compliant cookie consent management platform',
      'Limit cookies to strictly necessary ones where possible',
      'Replace third-party tracking cookies with first-party alternatives',
    ],
  },
  {
    id: 'gdpr-email-marketing',
    regulation: 'GDPR',
    applicableRecommendationTypes: ['email_marketing'],
    complianceRequirements: [
      'Obtain explicit opt-in consent before sending marketing emails (Art. 6 + ePrivacy)',
      'Include unsubscribe link in every marketing email',
      'Maintain records of consent for each subscriber',
      'Do not pre-tick consent checkboxes',
    ],
    suggestedAlternatives: [
      'Use double opt-in email subscription flows',
      'Segment lists to send only to confirmed opt-in subscribers',
      'Provide clear value proposition at point of consent',
    ],
  },
  {
    id: 'gdpr-behavioral-targeting',
    regulation: 'GDPR',
    applicableRecommendationTypes: ['behavioral_targeting'],
    complianceRequirements: [
      'Obtain explicit consent for profiling and behavioural targeting (Art. 22)',
      'Provide right to object to profiling (Art. 21)',
      'Disclose automated decision-making in privacy policy (Art. 13)',
      'Conduct DPIA for large-scale profiling activities (Art. 35)',
    ],
    suggestedAlternatives: [
      'Use contextual targeting instead of behavioural targeting',
      'Implement consent-gated personalisation features',
      'Offer users control over their personalisation preferences',
    ],
  },
];

const PIPEDA_RULES: Omit<RegulatoryRule, 'locale'>[] = [
  {
    id: 'pipeda-data-collection',
    regulation: 'PIPEDA',
    applicableRecommendationTypes: ['data_collection'],
    complianceRequirements: [
      'Obtain meaningful consent before collecting personal information (Principle 3)',
      'Limit collection to what is necessary for identified purposes (Principle 4)',
      'Identify purposes for collection at or before time of collection (Principle 2)',
      'Provide individuals access to their personal information (Principle 9)',
    ],
    suggestedAlternatives: [
      'Implement clear consent flows explaining data collection purposes',
      'Use privacy-by-design approach to minimise data collection',
      'Provide users with access and correction rights for their data',
    ],
  },
  {
    id: 'pipeda-user-tracking',
    regulation: 'PIPEDA',
    applicableRecommendationTypes: ['user_tracking'],
    complianceRequirements: [
      'Disclose tracking practices in privacy policy (Principle 8)',
      'Obtain consent for tracking personal information (Principle 3)',
      'Allow individuals to withdraw consent for tracking (Principle 3)',
      'Safeguard personal information collected through tracking (Principle 7)',
    ],
    suggestedAlternatives: [
      'Provide clear opt-out mechanisms for tracking',
      'Use aggregated analytics that do not identify individuals',
      'Implement privacy-preserving measurement techniques',
    ],
  },
  {
    id: 'pipeda-cookie-usage',
    regulation: 'PIPEDA',
    applicableRecommendationTypes: ['cookie_usage'],
    complianceRequirements: [
      'Disclose cookie usage in privacy policy (Principle 8)',
      'Obtain consent for non-essential cookies that collect personal information',
      'Provide mechanism to opt out of non-essential cookies',
    ],
    suggestedAlternatives: [
      'Implement cookie consent notice for Canadian visitors',
      'Limit cookies to functional purposes where possible',
      'Provide clear cookie policy explaining each category',
    ],
  },
  {
    id: 'pipeda-email-marketing',
    regulation: 'PIPEDA',
    applicableRecommendationTypes: ['email_marketing'],
    complianceRequirements: [
      'Obtain express or implied consent before sending commercial electronic messages (CASL)',
      'Include sender identification and unsubscribe mechanism in every message (CASL)',
      'Process unsubscribe requests within 10 business days (CASL)',
      'Maintain records of consent',
    ],
    suggestedAlternatives: [
      'Use CASL-compliant double opt-in subscription flows',
      'Clearly identify the sender and purpose in all marketing emails',
      'Implement automated unsubscribe processing',
    ],
  },
  {
    id: 'pipeda-behavioral-targeting',
    regulation: 'PIPEDA',
    applicableRecommendationTypes: ['behavioral_targeting'],
    complianceRequirements: [
      'Disclose behavioural targeting practices in privacy policy (Principle 8)',
      'Obtain consent for use of personal information for targeting (Principle 3)',
      'Allow individuals to opt out of targeted advertising',
      'Safeguard personal information used for targeting (Principle 7)',
    ],
    suggestedAlternatives: [
      'Use contextual advertising as a privacy-respecting alternative',
      'Implement opt-in consent for personalised advertising',
      'Provide clear explanation of targeting practices to users',
    ],
  },
];

const PRIVACY_ACT_RULES: Omit<RegulatoryRule, 'locale'>[] = [
  {
    id: 'privacy-act-data-collection',
    regulation: 'Privacy Act',
    applicableRecommendationTypes: ['data_collection'],
    complianceRequirements: [
      'Collect personal information only by lawful and fair means (APP 3)',
      'Notify individuals of collection, purpose, and disclosure at time of collection (APP 5)',
      'Collect only information reasonably necessary for functions (APP 3)',
      'Allow individuals to access and correct their personal information (APP 12, 13)',
    ],
    suggestedAlternatives: [
      'Implement collection notices at point of data capture',
      'Use privacy impact assessments before new data collection activities',
      'Provide individuals with clear access and correction mechanisms',
    ],
  },
  {
    id: 'privacy-act-user-tracking',
    regulation: 'Privacy Act',
    applicableRecommendationTypes: ['user_tracking'],
    complianceRequirements: [
      'Disclose tracking in privacy policy (APP 1)',
      'Obtain consent for tracking that collects personal information (APP 3)',
      'Use or disclose personal information only for the primary purpose of collection (APP 6)',
      'Implement reasonable security safeguards for tracked data (APP 11)',
    ],
    suggestedAlternatives: [
      'Use anonymised analytics that do not collect personal information',
      'Provide clear opt-out for behavioural tracking',
      'Implement data retention limits for tracking data',
    ],
  },
  {
    id: 'privacy-act-cookie-usage',
    regulation: 'Privacy Act',
    applicableRecommendationTypes: ['cookie_usage'],
    complianceRequirements: [
      'Disclose cookie usage in privacy policy (APP 1)',
      'Obtain consent for cookies that collect personal information (APP 3)',
      'Provide mechanism to manage cookie preferences',
    ],
    suggestedAlternatives: [
      'Implement cookie consent management for Australian visitors',
      'Limit tracking cookies to those strictly necessary',
      'Provide clear cookie policy with opt-out options',
    ],
  },
  {
    id: 'privacy-act-email-marketing',
    regulation: 'Privacy Act',
    applicableRecommendationTypes: ['email_marketing'],
    complianceRequirements: [
      'Obtain consent before sending unsolicited commercial messages (Spam Act 2003)',
      'Include accurate sender identification in all messages (Spam Act 2003)',
      'Provide functional unsubscribe mechanism in every message (Spam Act 2003)',
      'Process unsubscribe requests promptly',
    ],
    suggestedAlternatives: [
      'Use opt-in subscription flows compliant with the Spam Act',
      'Clearly identify sender and include unsubscribe in all emails',
      'Maintain suppression lists for unsubscribed contacts',
    ],
  },
  {
    id: 'privacy-act-behavioral-targeting',
    regulation: 'Privacy Act',
    applicableRecommendationTypes: ['behavioral_targeting'],
    complianceRequirements: [
      'Disclose behavioural targeting in privacy policy (APP 1)',
      'Use personal information only for the purpose it was collected (APP 6)',
      'Obtain consent for secondary use of personal information for targeting (APP 6)',
      'Implement reasonable security for personal information used in targeting (APP 11)',
    ],
    suggestedAlternatives: [
      'Use contextual targeting that does not rely on personal information',
      'Implement consent-based personalisation with clear user controls',
      'Provide opt-out for interest-based advertising',
    ],
  },
];

// ---------------------------------------------------------------------------
// Helper: build RegulatoryConfig for a locale
// ---------------------------------------------------------------------------

function buildConfig(locale: string): RegulatoryConfig {
  if (EU_LOCALES.has(locale)) {
    return {
      locale,
      applicableRegulations: GDPR_RULES.map((r) => ({ ...r, locale })),
    };
  }
  if (locale === 'en-CA') {
    return {
      locale,
      applicableRegulations: PIPEDA_RULES.map((r) => ({ ...r, locale })),
    };
  }
  if (locale === 'en-AU') {
    return {
      locale,
      applicableRegulations: PRIVACY_ACT_RULES.map((r) => ({ ...r, locale })),
    };
  }
  // No regulations for en-US, en-GB, or unknown locales
  return { locale, applicableRegulations: [] };
}

// ---------------------------------------------------------------------------
// RegulatoryComplianceChecker
// ---------------------------------------------------------------------------

export class RegulatoryComplianceChecker {
  /**
   * Check a single recommendation against applicable regulations for the given locale.
   * Returns an array of RegulatoryFlag objects (empty if no concerns).
   */
  async checkRecommendation(
    recommendation: { id: string; type: string; description: string },
    locale: string,
  ): Promise<RegulatoryFlag[]> {
    const config = buildConfig(locale);
    const flags: RegulatoryFlag[] = [];

    for (const rule of config.applicableRegulations) {
      if (rule.applicableRecommendationTypes.includes(recommendation.type)) {
        flags.push({
          recommendationId: recommendation.id,
          regulation: rule.regulation,
          severity: 'warning',
          message: `This recommendation (${recommendation.type}) may have ${rule.regulation} implications and requires legal review before implementation.`,
          complianceRequirements: [...rule.complianceRequirements],
          suggestedAlternatives: [...rule.suggestedAlternatives],
        });
      }
    }

    return flags;
  }

  /**
   * Return the applicable regulatory rules for a given locale.
   */
  async getApplicableRegulations(locale: string): Promise<RegulatoryRule[]> {
    return buildConfig(locale).applicableRegulations;
  }

  /**
   * Validate a list of recommendations against applicable regulations and
   * return a full ComplianceReport.
   *
   * complianceScore = (totalRecommendations - flaggedRecommendations) / totalRecommendations
   * Returns 1.0 when there are no recommendations.
   */
  async validateCompliance(
    recommendations: Array<{ id: string; type: string; description: string }>,
    locale: string,
  ): Promise<ComplianceReport> {
    const allFlags: RegulatoryFlag[] = [];
    const flaggedIds = new Set<string>();

    for (const rec of recommendations) {
      const flags = await this.checkRecommendation(rec, locale);
      for (const flag of flags) {
        allFlags.push(flag);
        flaggedIds.add(rec.id);
      }
    }

    const total = recommendations.length;
    const flaggedCount = flaggedIds.size;
    const complianceScore = total === 0 ? 1 : (total - flaggedCount) / total;

    return {
      locale,
      totalRecommendations: total,
      flaggedRecommendations: flaggedCount,
      flags: allFlags,
      complianceScore,
    };
  }

  /**
   * Return suggested compliant alternatives for a given regulatory flag.
   */
  getSuggestedAlternatives(flag: RegulatoryFlag): string[] {
    return [...flag.suggestedAlternatives];
  }
}
