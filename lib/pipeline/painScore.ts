/**
 * Pain Score Calculator
 * 
 * Computes a composite qualification score (0-100) from multi-signal audit data.
 * Each dimension is weighted and capped at its maximum value.
 * 
 * Weights:
 * - Website speed: 20
 * - Mobile broken: 15
 * - GBP neglected: 15
 * - No SSL: 10
 * - Zero review responses: 10
 * - Social media dead: 10
 * - Competitors outperforming: 10
 * - Accessibility violations: 10
 * 
 * Requirements: 1.3, 1.4
 */

import type { QualificationSignals, PainScoreBreakdown, PainScoreConfig } from './types';

/**
 * Default weight configuration for pain score dimensions
 */
export const DEFAULT_WEIGHTS: PainScoreBreakdown = {
  websiteSpeed: 20,
  mobileBroken: 15,
  gbpNeglected: 15,
  noSsl: 10,
  zeroReviewResponses: 10,
  socialMediaDead: 10,
  competitorsOutperforming: 10,
  accessibilityViolations: 10,
};

/**
 * Calculate pain score from qualification signals
 * 
 * Each dimension is scored independently and capped at its weight maximum.
 * The total score equals the sum of all dimension scores.
 * 
 * @param signals - Multi-signal audit data
 * @param weights - Optional custom weights (defaults to DEFAULT_WEIGHTS)
 * @returns Object containing total score (0-100) and breakdown by dimension
 */
export function calculate(
  signals: QualificationSignals,
  weights: PainScoreBreakdown = DEFAULT_WEIGHTS
): { total: number; breakdown: PainScoreBreakdown } {
  const breakdown: PainScoreBreakdown = {
    websiteSpeed: 0,
    mobileBroken: 0,
    gbpNeglected: 0,
    noSsl: 0,
    zeroReviewResponses: 0,
    socialMediaDead: 0,
    competitorsOutperforming: 0,
    accessibilityViolations: 0,
  };

  // Website Speed (0-20): Lower page speed score = higher pain
  // PageSpeed score is 0-100, where 100 is best
  if (signals.pageSpeedScore !== undefined && !isNaN(signals.pageSpeedScore)) {
    // Invert the score: 0 speed = 20 pain, 100 speed = 0 pain
    const speedPain = (100 - signals.pageSpeedScore) / 100;
    breakdown.websiteSpeed = Math.min(speedPain * weights.websiteSpeed, weights.websiteSpeed);
  }

  // Mobile Broken (0-15): Not responsive = full pain
  if (signals.mobileResponsive !== undefined) {
    breakdown.mobileBroken = signals.mobileResponsive ? 0 : weights.mobileBroken;
  }

  // GBP Neglected (0-15): Composite of claim status, photos, reviews, responses, posting
  if (signals.gbpClaimed !== undefined) {
    let gbpPain = 0;
    
    // Not claimed = 60% of max pain
    if (!signals.gbpClaimed) {
      gbpPain = 0.6;
    } else {
      // Claimed but neglected indicators
      let neglectScore = 0;
      let indicators = 0;

      // Few photos (< 5)
      if (signals.gbpPhotoCount !== undefined) {
        indicators++;
        if (signals.gbpPhotoCount < 5) {
          neglectScore += 0.25;
        }
      }

      // Low review response rate (< 0.3)
      if (signals.gbpReviewResponseRate !== undefined && !isNaN(signals.gbpReviewResponseRate)) {
        indicators++;
        if (signals.gbpReviewResponseRate < 0.3) {
          neglectScore += 0.25;
        }
      }

      // Infrequent posting (> 30 days)
      if (signals.gbpPostingFrequencyDays !== undefined) {
        indicators++;
        if (signals.gbpPostingFrequencyDays > 30) {
          neglectScore += 0.25;
        }
      }

      // Few reviews (< 10)
      if (signals.gbpReviewCount !== undefined) {
        indicators++;
        if (signals.gbpReviewCount < 10) {
          neglectScore += 0.25;
        }
      }

      // Average the neglect indicators
      if (indicators > 0) {
        gbpPain = neglectScore / indicators;
      }
    }

    breakdown.gbpNeglected = Math.min(gbpPain * weights.gbpNeglected, weights.gbpNeglected);
  }

  // No SSL (0-10): No HTTPS = full pain
  if (signals.hasSsl !== undefined) {
    breakdown.noSsl = signals.hasSsl ? 0 : weights.noSsl;
  }

  // Zero Review Responses (0-10): No responses = full pain
  if (signals.gbpReviewResponseRate !== undefined && !isNaN(signals.gbpReviewResponseRate)) {
    // 0 response rate = full pain, 1.0 response rate = 0 pain
    const responsePain = 1 - signals.gbpReviewResponseRate;
    breakdown.zeroReviewResponses = Math.min(responsePain * weights.zeroReviewResponses, weights.zeroReviewResponses);
  }

  // Social Media Dead (0-10): No presence or stale posts
  if (signals.socialPresent !== undefined) {
    let socialPain = 0;

    if (!signals.socialPresent) {
      // No social presence = full pain
      socialPain = 1.0;
    } else if (signals.socialLastPostDays !== undefined) {
      // Has social but stale: > 90 days = full pain, < 7 days = 0 pain
      if (signals.socialLastPostDays > 90) {
        socialPain = 1.0;
      } else if (signals.socialLastPostDays > 30) {
        socialPain = 0.7;
      } else if (signals.socialLastPostDays > 7) {
        socialPain = 0.3;
      }
    }

    breakdown.socialMediaDead = Math.min(socialPain * weights.socialMediaDead, weights.socialMediaDead);
  }

  // Competitors Outperforming (0-10): Gap between prospect and competitors
  if (signals.competitorScoreGap !== undefined && !isNaN(signals.competitorScoreGap)) {
    // Gap is a positive number indicating how much better competitors are
    // Normalize to 0-1 range (assume max gap of 50 points)
    const gapPain = Math.min(signals.competitorScoreGap / 50, 1.0);
    breakdown.competitorsOutperforming = Math.min(gapPain * weights.competitorsOutperforming, weights.competitorsOutperforming);
  }

  // Accessibility Violations (0-10): More violations = more pain
  if (signals.accessibilityViolationCount !== undefined) {
    // Normalize: 0 violations = 0 pain, 20+ violations = full pain
    const a11yPain = Math.min(signals.accessibilityViolationCount / 20, 1.0);
    breakdown.accessibilityViolations = Math.min(a11yPain * weights.accessibilityViolations, weights.accessibilityViolations);
  }

  // Calculate total as sum of all dimensions
  const total = 
    breakdown.websiteSpeed +
    breakdown.mobileBroken +
    breakdown.gbpNeglected +
    breakdown.noSsl +
    breakdown.zeroReviewResponses +
    breakdown.socialMediaDead +
    breakdown.competitorsOutperforming +
    breakdown.accessibilityViolations;

  return {
    total: Math.round(total * 100) / 100, // Round to 2 decimal places
    breakdown,
  };
}

/**
 * Serialize PainScoreConfig to JSON string
 * 
 * @param config - Pain score configuration
 * @returns JSON string representation
 */
export function serialize(config: PainScoreConfig): string {
  return JSON.stringify(config);
}

/**
 * Deserialize PainScoreConfig from JSON string
 * 
 * @param json - JSON string representation
 * @returns Pain score configuration object
 */
export function deserialize(json: string): PainScoreConfig {
  const parsed = JSON.parse(json);
  
  // Validate structure
  if (!parsed.weights || typeof parsed.threshold !== 'number') {
    throw new Error('Invalid PainScoreConfig JSON: missing weights or threshold');
  }

  // Validate weights structure
  const requiredKeys: (keyof PainScoreBreakdown)[] = [
    'websiteSpeed',
    'mobileBroken',
    'gbpNeglected',
    'noSsl',
    'zeroReviewResponses',
    'socialMediaDead',
    'competitorsOutperforming',
    'accessibilityViolations',
  ];

  for (const key of requiredKeys) {
    if (typeof parsed.weights[key] !== 'number') {
      throw new Error(`Invalid PainScoreConfig JSON: weights.${key} must be a number`);
    }
  }

  return parsed as PainScoreConfig;
}

/**
 * Create a default PainScoreConfig
 * 
 * @param threshold - Qualification threshold (default: 60)
 * @returns Default pain score configuration
 */
export function createDefaultConfig(threshold: number = 60): PainScoreConfig {
  return {
    weights: DEFAULT_WEIGHTS,
    threshold,
  };
}
