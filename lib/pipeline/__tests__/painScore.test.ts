/**
 * Unit tests for Pain Score Calculator
 * 
 * These tests verify specific examples and edge cases for the pain score calculation.
 * Property-based tests are in painScore.property.test.ts (task 3.2)
 */

import { describe, it, expect } from 'vitest';
import { calculate, serialize, deserialize, createDefaultConfig, DEFAULT_WEIGHTS } from '../painScore';
import type { QualificationSignals, PainScoreConfig } from '../types';

describe('Pain Score Calculator', () => {
  describe('calculate()', () => {
    it('should return 0 for perfect signals', () => {
      const signals: QualificationSignals = {
        pageSpeedScore: 100,
        mobileResponsive: true,
        hasSsl: true,
        gbpClaimed: true,
        gbpPhotoCount: 20,
        gbpReviewCount: 50,
        gbpReviewResponseRate: 1.0,
        gbpPostingFrequencyDays: 3,
        socialPresent: true,
        socialLastPostDays: 1,
        competitorScoreGap: 0,
        accessibilityViolationCount: 0,
      };

      const result = calculate(signals);
      expect(result.total).toBe(0);
      expect(result.breakdown.websiteSpeed).toBe(0);
      expect(result.breakdown.mobileBroken).toBe(0);
      expect(result.breakdown.gbpNeglected).toBe(0);
      expect(result.breakdown.noSsl).toBe(0);
      expect(result.breakdown.zeroReviewResponses).toBe(0);
      expect(result.breakdown.socialMediaDead).toBe(0);
      expect(result.breakdown.competitorsOutperforming).toBe(0);
      expect(result.breakdown.accessibilityViolations).toBe(0);
    });

    it('should return maximum score for worst signals', () => {
      const signals: QualificationSignals = {
        pageSpeedScore: 0,
        mobileResponsive: false,
        hasSsl: false,
        gbpClaimed: false,
        gbpReviewResponseRate: 0,
        socialPresent: false,
        competitorScoreGap: 50,
        accessibilityViolationCount: 20,
      };

      const result = calculate(signals);
      // Total is 94 because unclaimed GBP is 60% of max (9 points, not 15)
      expect(result.total).toBe(94);
      expect(result.breakdown.websiteSpeed).toBe(20);
      expect(result.breakdown.mobileBroken).toBe(15);
      expect(result.breakdown.gbpNeglected).toBe(9); // 60% of 15 for unclaimed
      expect(result.breakdown.noSsl).toBe(10);
      expect(result.breakdown.zeroReviewResponses).toBe(10);
      expect(result.breakdown.socialMediaDead).toBe(10);
      expect(result.breakdown.competitorsOutperforming).toBe(10);
      expect(result.breakdown.accessibilityViolations).toBe(10);
    });

    it('should cap each dimension at its weight maximum', () => {
      const signals: QualificationSignals = {
        pageSpeedScore: -50, // Invalid but should be capped
        competitorScoreGap: 1000, // Way above threshold
        accessibilityViolationCount: 1000, // Way above threshold
      };

      const result = calculate(signals);
      expect(result.breakdown.websiteSpeed).toBeLessThanOrEqual(DEFAULT_WEIGHTS.websiteSpeed);
      expect(result.breakdown.competitorsOutperforming).toBeLessThanOrEqual(DEFAULT_WEIGHTS.competitorsOutperforming);
      expect(result.breakdown.accessibilityViolations).toBeLessThanOrEqual(DEFAULT_WEIGHTS.accessibilityViolations);
    });

    it('should handle partial signals gracefully', () => {
      const signals: QualificationSignals = {
        pageSpeedScore: 50,
        hasSsl: false,
      };

      const result = calculate(signals);
      expect(result.total).toBeGreaterThan(0);
      expect(result.breakdown.websiteSpeed).toBeGreaterThan(0);
      expect(result.breakdown.noSsl).toBe(10);
      expect(result.breakdown.mobileBroken).toBe(0); // Not provided
      expect(result.breakdown.gbpNeglected).toBe(0); // Not provided
    });

    it('should calculate website speed pain correctly', () => {
      const signals1: QualificationSignals = { pageSpeedScore: 100 };
      const result1 = calculate(signals1);
      expect(result1.breakdown.websiteSpeed).toBe(0);

      const signals2: QualificationSignals = { pageSpeedScore: 50 };
      const result2 = calculate(signals2);
      expect(result2.breakdown.websiteSpeed).toBe(10); // 50% of 20

      const signals3: QualificationSignals = { pageSpeedScore: 0 };
      const result3 = calculate(signals3);
      expect(result3.breakdown.websiteSpeed).toBe(20);
    });

    it('should calculate GBP neglect correctly for unclaimed', () => {
      const signals: QualificationSignals = {
        gbpClaimed: false,
      };

      const result = calculate(signals);
      expect(result.breakdown.gbpNeglected).toBe(9); // 60% of 15
    });

    it('should calculate GBP neglect correctly for claimed but neglected', () => {
      const signals: QualificationSignals = {
        gbpClaimed: true,
        gbpPhotoCount: 2, // < 5
        gbpReviewCount: 5, // < 10
        gbpReviewResponseRate: 0.1, // < 0.3
        gbpPostingFrequencyDays: 60, // > 30
      };

      const result = calculate(signals);
      // All 4 indicators show neglect: (0.25 + 0.25 + 0.25 + 0.25) / 4 = 0.25 average
      // 0.25 * 15 = 3.75
      expect(result.breakdown.gbpNeglected).toBe(3.75);
    });

    it('should calculate social media pain correctly', () => {
      const signals1: QualificationSignals = { socialPresent: false };
      const result1 = calculate(signals1);
      expect(result1.breakdown.socialMediaDead).toBe(10);

      const signals2: QualificationSignals = { socialPresent: true, socialLastPostDays: 100 };
      const result2 = calculate(signals2);
      expect(result2.breakdown.socialMediaDead).toBe(10); // > 90 days

      const signals3: QualificationSignals = { socialPresent: true, socialLastPostDays: 45 };
      const result3 = calculate(signals3);
      expect(result3.breakdown.socialMediaDead).toBe(7); // 30-90 days

      const signals4: QualificationSignals = { socialPresent: true, socialLastPostDays: 3 };
      const result4 = calculate(signals4);
      expect(result4.breakdown.socialMediaDead).toBe(0); // < 7 days
    });

    it('should ensure total equals sum of dimensions', () => {
      const signals: QualificationSignals = {
        pageSpeedScore: 60,
        mobileResponsive: false,
        hasSsl: true,
        gbpClaimed: true,
        gbpPhotoCount: 3,
        gbpReviewResponseRate: 0.5,
        socialPresent: true,
        socialLastPostDays: 40,
        competitorScoreGap: 25,
        accessibilityViolationCount: 10,
      };

      const result = calculate(signals);
      const sum = 
        result.breakdown.websiteSpeed +
        result.breakdown.mobileBroken +
        result.breakdown.gbpNeglected +
        result.breakdown.noSsl +
        result.breakdown.zeroReviewResponses +
        result.breakdown.socialMediaDead +
        result.breakdown.competitorsOutperforming +
        result.breakdown.accessibilityViolations;

      expect(result.total).toBeCloseTo(sum, 1);
    });

    it('should use custom weights when provided', () => {
      const customWeights = {
        websiteSpeed: 30,
        mobileBroken: 20,
        gbpNeglected: 10,
        noSsl: 5,
        zeroReviewResponses: 5,
        socialMediaDead: 10,
        competitorsOutperforming: 10,
        accessibilityViolations: 10,
      };

      const signals: QualificationSignals = {
        pageSpeedScore: 0,
        mobileResponsive: false,
      };

      const result = calculate(signals, customWeights);
      expect(result.breakdown.websiteSpeed).toBe(30);
      expect(result.breakdown.mobileBroken).toBe(20);
    });
  });

  describe('serialize() and deserialize()', () => {
    it('should round-trip serialize and deserialize', () => {
      const config: PainScoreConfig = {
        weights: DEFAULT_WEIGHTS,
        threshold: 60,
      };

      const json = serialize(config);
      const deserialized = deserialize(json);

      expect(deserialized).toEqual(config);
      expect(deserialized.threshold).toBe(60);
      expect(deserialized.weights.websiteSpeed).toBe(20);
      expect(deserialized.weights.mobileBroken).toBe(15);
    });

    it('should handle custom weights in serialization', () => {
      const config: PainScoreConfig = {
        weights: {
          websiteSpeed: 25,
          mobileBroken: 20,
          gbpNeglected: 15,
          noSsl: 10,
          zeroReviewResponses: 10,
          socialMediaDead: 5,
          competitorsOutperforming: 10,
          accessibilityViolations: 5,
        },
        threshold: 70,
      };

      const json = serialize(config);
      const deserialized = deserialize(json);

      expect(deserialized).toEqual(config);
    });

    it('should throw on invalid JSON', () => {
      expect(() => deserialize('invalid json')).toThrow();
    });

    it('should throw on missing weights', () => {
      const invalidJson = JSON.stringify({ threshold: 60 });
      expect(() => deserialize(invalidJson)).toThrow('missing weights or threshold');
    });

    it('should throw on missing threshold', () => {
      const invalidJson = JSON.stringify({ weights: DEFAULT_WEIGHTS });
      expect(() => deserialize(invalidJson)).toThrow('missing weights or threshold');
    });

    it('should throw on invalid weight structure', () => {
      const invalidJson = JSON.stringify({
        weights: { websiteSpeed: 'not a number' },
        threshold: 60,
      });
      expect(() => deserialize(invalidJson)).toThrow('must be a number');
    });
  });

  describe('createDefaultConfig()', () => {
    it('should create config with default threshold', () => {
      const config = createDefaultConfig();
      expect(config.threshold).toBe(60);
      expect(config.weights).toEqual(DEFAULT_WEIGHTS);
    });

    it('should create config with custom threshold', () => {
      const config = createDefaultConfig(75);
      expect(config.threshold).toBe(75);
      expect(config.weights).toEqual(DEFAULT_WEIGHTS);
    });
  });
});
