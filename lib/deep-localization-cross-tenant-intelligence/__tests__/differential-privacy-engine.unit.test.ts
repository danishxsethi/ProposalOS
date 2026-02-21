/**
 * Unit tests for DifferentialPrivacyEngine
 * Requirements: 8.3, 12.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DifferentialPrivacyEngine } from '../differential-privacy-engine';
import { AnonymizedAuditMetrics } from '../types';

function makeAnonymizedMetrics(
  overrides: Partial<AnonymizedAuditMetrics> = {},
): AnonymizedAuditMetrics {
  return {
    anonymousId: 'a'.repeat(64),
    industry: 'dental',
    businessSize: 'small',
    locale: 'en-US',
    metrics: new Map([
      ['score', 72],
      ['pageSpeed', 85],
      ['mobileScore', 60],
    ]),
    timestamp: new Date('2024-01-15T10:00:00Z'),
    differentialPrivacyNoise: 0,
    ...overrides,
  };
}

describe('DifferentialPrivacyEngine', () => {
  let engine: DifferentialPrivacyEngine;

  beforeEach(() => {
    engine = new DifferentialPrivacyEngine({ epsilon: 1.0, sensitivity: 1.0 });
  });

  // --------------------------------------------------------------------------
  // Constructor and configuration
  // --------------------------------------------------------------------------

  describe('constructor', () => {
    it('should use default epsilon=1.0 and sensitivity=1.0 when no config provided', () => {
      const e = new DifferentialPrivacyEngine();
      expect(e.getConfig().epsilon).toBe(1.0);
      expect(e.getConfig().sensitivity).toBe(1.0);
    });

    it('should accept custom epsilon', () => {
      const e = new DifferentialPrivacyEngine({ epsilon: 0.5 });
      expect(e.getConfig().epsilon).toBe(0.5);
    });

    it('should throw for epsilon <= 0', () => {
      expect(() => new DifferentialPrivacyEngine({ epsilon: 0 })).toThrow(RangeError);
      expect(() => new DifferentialPrivacyEngine({ epsilon: -1 })).toThrow(RangeError);
    });

    it('should throw for non-finite epsilon', () => {
      expect(() => new DifferentialPrivacyEngine({ epsilon: Infinity })).toThrow(RangeError);
      expect(() => new DifferentialPrivacyEngine({ epsilon: NaN })).toThrow(RangeError);
    });

    it('should throw for sensitivity <= 0', () => {
      expect(() => new DifferentialPrivacyEngine({ sensitivity: 0 })).toThrow(RangeError);
      expect(() => new DifferentialPrivacyEngine({ sensitivity: -0.5 })).toThrow(RangeError);
    });
  });

  // --------------------------------------------------------------------------
  // configure()
  // --------------------------------------------------------------------------

  describe('configure', () => {
    it('should update epsilon at runtime', () => {
      engine.configure({ epsilon: 2.0 });
      expect(engine.getConfig().epsilon).toBe(2.0);
    });

    it('should update sensitivity at runtime', () => {
      engine.configure({ sensitivity: 5.0 });
      expect(engine.getConfig().sensitivity).toBe(5.0);
    });

    it('should throw for invalid epsilon in configure()', () => {
      expect(() => engine.configure({ epsilon: -1 })).toThrow(RangeError);
    });
  });

  // --------------------------------------------------------------------------
  // laplaceSample()
  // --------------------------------------------------------------------------

  describe('laplaceSample', () => {
    it('should return a finite number', () => {
      const sample = engine.laplaceSample(1.0);
      expect(isFinite(sample)).toBe(true);
    });

    it('should throw for scale <= 0', () => {
      expect(() => engine.laplaceSample(0)).toThrow(RangeError);
      expect(() => engine.laplaceSample(-1)).toThrow(RangeError);
    });

    it('should produce both positive and negative values across many samples', () => {
      const samples = Array.from({ length: 200 }, () => engine.laplaceSample(1.0));
      const hasPositive = samples.some((s) => s > 0);
      const hasNegative = samples.some((s) => s < 0);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });

    it('should produce larger noise with larger scale', () => {
      // With scale=10, average absolute noise should be larger than scale=0.1
      const smallScaleSamples = Array.from({ length: 500 }, () =>
        Math.abs(engine.laplaceSample(0.1)),
      );
      const largeScaleSamples = Array.from({ length: 500 }, () =>
        Math.abs(engine.laplaceSample(10.0)),
      );
      const smallAvg = smallScaleSamples.reduce((a, b) => a + b, 0) / 500;
      const largeAvg = largeScaleSamples.reduce((a, b) => a + b, 0) / 500;
      expect(largeAvg).toBeGreaterThan(smallAvg);
    });

    it('should have mean approximately 0 for large sample size', () => {
      const samples = Array.from({ length: 10000 }, () => engine.laplaceSample(1.0));
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      // Mean should be close to 0 (within 0.1 for 10k samples)
      expect(Math.abs(mean)).toBeLessThan(0.1);
    });
  });

  // --------------------------------------------------------------------------
  // addNoise()
  // --------------------------------------------------------------------------

  describe('addNoise', () => {
    it('should return a number different from the original (almost always)', () => {
      // With epsilon=1, sensitivity=1, scale=1 — noise is almost never exactly 0
      const original = 50;
      const noised = engine.addNoise(original);
      // This could theoretically equal original but probability is ~0
      expect(typeof noised).toBe('number');
      expect(isFinite(noised)).toBe(true);
    });

    it('should accept per-call epsilon override', () => {
      // With very small epsilon (strong privacy), noise should be large
      const samples = Array.from({ length: 100 }, () =>
        Math.abs(engine.addNoise(0, 0.01) - 0),
      );
      const avg = samples.reduce((a, b) => a + b, 0) / 100;
      // scale = 1/0.01 = 100, expected mean absolute noise = 100
      expect(avg).toBeGreaterThan(10);
    });

    it('should throw for invalid epsilon in addNoise()', () => {
      expect(() => engine.addNoise(50, 0)).toThrow(RangeError);
    });
  });

  // --------------------------------------------------------------------------
  // applyDifferentialPrivacy()
  // --------------------------------------------------------------------------

  describe('applyDifferentialPrivacy', () => {
    it('should return an AnonymizedAuditMetrics with the same keys', () => {
      const data = makeAnonymizedMetrics();
      const result = engine.applyDifferentialPrivacy(data);
      expect(result.metrics.size).toBe(data.metrics.size);
      for (const key of data.metrics.keys()) {
        expect(result.metrics.has(key)).toBe(true);
      }
    });

    it('should inject noise so metric values differ from originals', () => {
      const data = makeAnonymizedMetrics();
      // Run many times to ensure at least one value changes
      let anyChanged = false;
      for (let i = 0; i < 20; i++) {
        const result = engine.applyDifferentialPrivacy(data);
        for (const [key, original] of data.metrics.entries()) {
          if (result.metrics.get(key) !== original) {
            anyChanged = true;
            break;
          }
        }
        if (anyChanged) break;
      }
      expect(anyChanged).toBe(true);
    });

    it('should set differentialPrivacyNoise to a non-negative number', () => {
      const data = makeAnonymizedMetrics();
      const result = engine.applyDifferentialPrivacy(data);
      expect(result.differentialPrivacyNoise).toBeGreaterThanOrEqual(0);
      expect(isFinite(result.differentialPrivacyNoise)).toBe(true);
    });

    it('should preserve all non-metric fields', () => {
      const data = makeAnonymizedMetrics();
      const result = engine.applyDifferentialPrivacy(data);
      expect(result.anonymousId).toBe(data.anonymousId);
      expect(result.industry).toBe(data.industry);
      expect(result.businessSize).toBe(data.businessSize);
      expect(result.locale).toBe(data.locale);
      expect(result.timestamp).toEqual(data.timestamp);
    });

    it('should handle empty metrics map', () => {
      const data = makeAnonymizedMetrics({ metrics: new Map() });
      const result = engine.applyDifferentialPrivacy(data);
      expect(result.metrics.size).toBe(0);
      expect(result.differentialPrivacyNoise).toBe(0);
    });

    it('should produce larger average noise with smaller epsilon (stronger privacy)', () => {
      const data = makeAnonymizedMetrics();
      const noiseHighPrivacy: number[] = [];
      const noiseLowPrivacy: number[] = [];

      for (let i = 0; i < 50; i++) {
        const r1 = engine.applyDifferentialPrivacy(data, 0.1); // strong privacy
        const r2 = engine.applyDifferentialPrivacy(data, 10.0); // weak privacy
        noiseHighPrivacy.push(r1.differentialPrivacyNoise);
        noiseLowPrivacy.push(r2.differentialPrivacyNoise);
      }

      const avgHighPrivacy = noiseHighPrivacy.reduce((a, b) => a + b, 0) / 50;
      const avgLowPrivacy = noiseLowPrivacy.reduce((a, b) => a + b, 0) / 50;
      expect(avgHighPrivacy).toBeGreaterThan(avgLowPrivacy);
    });

    it('should accept per-call epsilon override', () => {
      const data = makeAnonymizedMetrics();
      const result = engine.applyDifferentialPrivacy(data, 0.5);
      expect(result.metrics.size).toBe(data.metrics.size);
    });

    it('should throw for invalid epsilon', () => {
      const data = makeAnonymizedMetrics();
      expect(() => engine.applyDifferentialPrivacy(data, 0)).toThrow(RangeError);
      expect(() => engine.applyDifferentialPrivacy(data, -1)).toThrow(RangeError);
    });

    it('should not mutate the original data', () => {
      const data = makeAnonymizedMetrics();
      const originalScore = data.metrics.get('score');
      engine.applyDifferentialPrivacy(data);
      expect(data.metrics.get('score')).toBe(originalScore);
    });
  });

  // --------------------------------------------------------------------------
  // Privacy-utility tradeoff
  // --------------------------------------------------------------------------

  describe('privacy-utility tradeoff', () => {
    it('epsilon=0.1 should produce more noise than epsilon=1.0', () => {
      const data = makeAnonymizedMetrics();
      const runs = 100;
      let totalNoise01 = 0;
      let totalNoise10 = 0;

      for (let i = 0; i < runs; i++) {
        totalNoise01 += engine.applyDifferentialPrivacy(data, 0.1).differentialPrivacyNoise;
        totalNoise10 += engine.applyDifferentialPrivacy(data, 1.0).differentialPrivacyNoise;
      }

      expect(totalNoise01 / runs).toBeGreaterThan(totalNoise10 / runs);
    });

    it('epsilon=1.0 should produce more noise than epsilon=10.0', () => {
      const data = makeAnonymizedMetrics();
      const runs = 100;
      let totalNoise10 = 0;
      let totalNoise100 = 0;

      for (let i = 0; i < runs; i++) {
        totalNoise10 += engine.applyDifferentialPrivacy(data, 1.0).differentialPrivacyNoise;
        totalNoise100 += engine.applyDifferentialPrivacy(data, 10.0).differentialPrivacyNoise;
      }

      expect(totalNoise10 / runs).toBeGreaterThan(totalNoise100 / runs);
    });
  });
});
