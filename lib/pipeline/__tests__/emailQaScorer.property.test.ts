/**
 * Property-Based Tests for Email QA Scorer
 * 
 * Tests Properties 19 and 20 from the design document using fast-check.
 * Minimum 100 iterations per property.
 * 
 * Feature: autonomous-proposal-engine
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  score,
  serializeConfig,
  deserializeConfig,
  DEFAULT_EMAIL_QA_CONFIG,
} from '../emailQaScorer';
import type { EmailQAConfig, GeneratedEmail } from '../types';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a valid EmailQAConfig
 */
const emailQAConfigArb = fc.record({
  maxReadingGradeLevel: fc.integer({ min: 1, max: 12 }),
  maxWordCount: fc.integer({ min: 20, max: 200 }),
  minFindingReferences: fc.integer({ min: 0, max: 5 }),
  maxSpamRiskScore: fc.integer({ min: 0, max: 100 }),
  minQualityScore: fc.integer({ min: 0, max: 100 }),
  jargonWordList: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 0, maxLength: 50 }),
  dimensionWeights: fc.record({
    readability: fc.integer({ min: 0, max: 50 }),
    wordCount: fc.integer({ min: 0, max: 50 }),
    jargon: fc.integer({ min: 0, max: 50 }),
    findingRefs: fc.integer({ min: 0, max: 50 }),
    spamRisk: fc.integer({ min: 0, max: 50 }),
  }),
});

/**
 * Generate a GeneratedEmail
 */
const generatedEmailArb = fc.record({
  id: fc.uuid(),
  subject: fc.string({ minLength: 5, maxLength: 100 }),
  body: fc.string({ minLength: 20, maxLength: 500 }),
  prospectId: fc.uuid(),
  proposalId: fc.uuid(),
  findingReferences: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
  scorecardUrl: fc.webUrl(),
  generatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
});

/**
 * Generate a simple email with controlled properties for testing
 */
const simpleEmailArb = fc.record({
  id: fc.uuid(),
  subject: fc.constant('Test Subject'),
  body: fc.string({ minLength: 10, maxLength: 200 }),
  prospectId: fc.uuid(),
  proposalId: fc.uuid(),
  findingReferences: fc.array(fc.constant('finding'), { minLength: 0, maxLength: 5 }),
  scorecardUrl: fc.constant('https://example.com/scorecard'),
  generatedAt: fc.constant(new Date('2024-01-01')),
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Email QA Scorer Property Tests', () => {
  /**
   * Property 19: Email QA composite score is bounded and decomposable
   * 
   * For any email evaluated by the Email QA Scorer, the composite score must
   * be between 0 and 100 inclusive, and must equal the weighted sum of the
   * individual dimension scores (readability, word count, jargon, finding
   * references, spam risk), and any dimension scoring below its threshold
   * must produce at least one improvement suggestion.
   * 
   * **Validates: Requirements 5.1, 5.2**
   */
  describe('Property 19: Email QA composite score is bounded and decomposable', () => {
    it('composite score is always between 0 and 100', () => {
      fc.assert(
        fc.property(generatedEmailArb, emailQAConfigArb, (email, config) => {
          const result = score(email, config);
          
          // Composite score must be bounded
          expect(result.compositeScore).toBeGreaterThanOrEqual(0);
          expect(result.compositeScore).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });

    it('composite score equals weighted sum of dimension scores', () => {
      fc.assert(
        fc.property(generatedEmailArb, emailQAConfigArb, (email, config) => {
          const result = score(email, config);
          
          // Calculate expected composite score
          const totalWeight =
            config.dimensionWeights.readability +
            config.dimensionWeights.wordCount +
            config.dimensionWeights.jargon +
            config.dimensionWeights.findingRefs +
            config.dimensionWeights.spamRisk;
          
          if (totalWeight === 0) {
            // If all weights are zero, composite should be 0
            expect(result.compositeScore).toBe(0);
          } else {
            const weightedSum =
              (result.dimensions.readability.score * config.dimensionWeights.readability) +
              (result.dimensions.wordCount.score * config.dimensionWeights.wordCount) +
              (result.dimensions.jargon.score * config.dimensionWeights.jargon) +
              (result.dimensions.findingRefs.score * config.dimensionWeights.findingRefs) +
              (result.dimensions.spamRisk.score * config.dimensionWeights.spamRisk);
            
            const expectedComposite = Math.round(weightedSum / totalWeight);
            
            // Composite score must equal weighted sum (rounded)
            expect(result.compositeScore).toBe(expectedComposite);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('all dimension scores are between 0 and 100', () => {
      fc.assert(
        fc.property(generatedEmailArb, emailQAConfigArb, (email, config) => {
          const result = score(email, config);
          
          // All dimension scores must be bounded
          expect(result.dimensions.readability.score).toBeGreaterThanOrEqual(0);
          expect(result.dimensions.readability.score).toBeLessThanOrEqual(100);
          
          expect(result.dimensions.wordCount.score).toBeGreaterThanOrEqual(0);
          expect(result.dimensions.wordCount.score).toBeLessThanOrEqual(100);
          
          expect(result.dimensions.jargon.score).toBeGreaterThanOrEqual(0);
          expect(result.dimensions.jargon.score).toBeLessThanOrEqual(100);
          
          expect(result.dimensions.findingRefs.score).toBeGreaterThanOrEqual(0);
          expect(result.dimensions.findingRefs.score).toBeLessThanOrEqual(100);
          
          expect(result.dimensions.spamRisk.score).toBeGreaterThanOrEqual(0);
          expect(result.dimensions.spamRisk.score).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });

    it('failing dimensions produce improvement suggestions', () => {
      fc.assert(
        fc.property(simpleEmailArb, (email) => {
          // Use a strict config that will likely fail some dimensions
          const strictConfig: EmailQAConfig = {
            maxReadingGradeLevel: 3,
            maxWordCount: 30,
            minFindingReferences: 3,
            maxSpamRiskScore: 10,
            minQualityScore: 95,
            jargonWordList: ['test', 'example', 'simple'],
            dimensionWeights: {
              readability: 20,
              wordCount: 20,
              jargon: 20,
              findingRefs: 20,
              spamRisk: 20,
            },
          };
          
          const result = score(email, strictConfig);
          
          // If composite score is below threshold, there should be suggestions
          if (result.compositeScore < strictConfig.minQualityScore) {
            expect(result.suggestions.length).toBeGreaterThan(0);
          }
          
          // If any dimension fails, there should be a suggestion for it
          if (result.dimensions.readability.gradeLevel > strictConfig.maxReadingGradeLevel) {
            const hasReadabilitySuggestion = result.suggestions.some(s => 
              s.toLowerCase().includes('reading level') || s.toLowerCase().includes('simplify')
            );
            expect(hasReadabilitySuggestion).toBe(true);
          }
          
          if (result.dimensions.wordCount.count > strictConfig.maxWordCount) {
            const hasWordCountSuggestion = result.suggestions.some(s => 
              s.toLowerCase().includes('word count') || s.toLowerCase().includes('reduce')
            );
            expect(hasWordCountSuggestion).toBe(true);
          }
          
          if (result.dimensions.jargon.termsFound.length > 0) {
            const hasJargonSuggestion = result.suggestions.some(s => 
              s.toLowerCase().includes('jargon')
            );
            expect(hasJargonSuggestion).toBe(true);
          }
          
          if (result.dimensions.findingRefs.refsFound < strictConfig.minFindingReferences) {
            const hasFindingRefSuggestion = result.suggestions.some(s => 
              s.toLowerCase().includes('finding')
            );
            expect(hasFindingRefSuggestion).toBe(true);
          }
          
          if (result.dimensions.spamRisk.triggersFound.length > 0) {
            const hasSpamSuggestion = result.suggestions.some(s => 
              s.toLowerCase().includes('spam')
            );
            expect(hasSpamSuggestion).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('passed flag is true only when composite score meets minimum', () => {
      fc.assert(
        fc.property(generatedEmailArb, emailQAConfigArb, (email, config) => {
          const result = score(email, config);
          
          // Passed flag must match composite score vs minimum
          if (result.compositeScore >= config.minQualityScore) {
            expect(result.passed).toBe(true);
          } else {
            expect(result.passed).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('dimension metrics are consistent with scores', () => {
      fc.assert(
        fc.property(generatedEmailArb, emailQAConfigArb, (email, config) => {
          const result = score(email, config);
          
          // Reading level: higher grade = lower score
          expect(result.dimensions.readability.gradeLevel).toBeGreaterThanOrEqual(0);
          
          // Word count: must match actual word count
          const actualWordCount = email.body.split(/\s+/).filter(w => w.trim().length > 0).length;
          expect(result.dimensions.wordCount.count).toBe(actualWordCount);
          
          // Jargon: terms found must be from jargon list
          for (const term of result.dimensions.jargon.termsFound) {
            const isInList = config.jargonWordList.some(jargon => 
              jargon.toLowerCase() === term.toLowerCase()
            );
            expect(isInList).toBe(true);
          }
          
          // Finding refs: must match actual references
          expect(result.dimensions.findingRefs.refsFound).toBe(email.findingReferences.length);
          
          // Spam risk: triggers found must be valid
          expect(Array.isArray(result.dimensions.spamRisk.triggersFound)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 20: Email QA config round-trip serialization
   * 
   * For any valid EmailQAConfig object, serializing to JSON and then
   * deserializing must produce an object equivalent to the original, with
   * all dimension weights, thresholds, and jargon word lists preserved.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 20: Email QA config round-trip serialization', () => {
    it('serialization and deserialization are inverse operations', () => {
      fc.assert(
        fc.property(emailQAConfigArb, (config) => {
          // Serialize the config
          const serialized = serializeConfig(config);
          
          // Verify it's valid JSON
          expect(() => JSON.parse(serialized)).not.toThrow();
          
          // Deserialize back
          const deserialized = deserializeConfig(serialized);
          
          // Verify all fields are preserved
          expect(deserialized.maxReadingGradeLevel).toBe(config.maxReadingGradeLevel);
          expect(deserialized.maxWordCount).toBe(config.maxWordCount);
          expect(deserialized.minFindingReferences).toBe(config.minFindingReferences);
          expect(deserialized.maxSpamRiskScore).toBe(config.maxSpamRiskScore);
          expect(deserialized.minQualityScore).toBe(config.minQualityScore);
          
          // Verify jargon word list is preserved
          expect(deserialized.jargonWordList).toEqual(config.jargonWordList);
          
          // Verify dimension weights are preserved
          expect(deserialized.dimensionWeights.readability).toBe(config.dimensionWeights.readability);
          expect(deserialized.dimensionWeights.wordCount).toBe(config.dimensionWeights.wordCount);
          expect(deserialized.dimensionWeights.jargon).toBe(config.dimensionWeights.jargon);
          expect(deserialized.dimensionWeights.findingRefs).toBe(config.dimensionWeights.findingRefs);
          expect(deserialized.dimensionWeights.spamRisk).toBe(config.dimensionWeights.spamRisk);
        }),
        { numRuns: 100 }
      );
    });

    it('handles default config correctly', () => {
      const serialized = serializeConfig(DEFAULT_EMAIL_QA_CONFIG);
      const deserialized = deserializeConfig(serialized);
      
      expect(deserialized).toEqual(DEFAULT_EMAIL_QA_CONFIG);
    });

    it('preserves jargon word list through serialization', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 100 }),
          (jargonList) => {
            const config: EmailQAConfig = {
              ...DEFAULT_EMAIL_QA_CONFIG,
              jargonWordList: jargonList,
            };
            
            const serialized = serializeConfig(config);
            const deserialized = deserializeConfig(serialized);
            
            expect(deserialized.jargonWordList).toEqual(jargonList);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves dimension weights through serialization', () => {
      fc.assert(
        fc.property(
          fc.record({
            readability: fc.integer({ min: 0, max: 100 }),
            wordCount: fc.integer({ min: 0, max: 100 }),
            jargon: fc.integer({ min: 0, max: 100 }),
            findingRefs: fc.integer({ min: 0, max: 100 }),
            spamRisk: fc.integer({ min: 0, max: 100 }),
          }),
          (weights) => {
            const config: EmailQAConfig = {
              ...DEFAULT_EMAIL_QA_CONFIG,
              dimensionWeights: weights,
            };
            
            const serialized = serializeConfig(config);
            const deserialized = deserializeConfig(serialized);
            
            expect(deserialized.dimensionWeights).toEqual(weights);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('throws on invalid JSON input', () => {
      expect(() => deserializeConfig('not valid json')).toThrow();
      expect(() => deserializeConfig('{}')).toThrow();
      expect(() => deserializeConfig('null')).toThrow();
      expect(() => deserializeConfig('[]')).toThrow();
    });

    it('throws on missing required fields', () => {
      const invalidConfigs = [
        '{"maxWordCount": 80}', // missing other fields
        '{"maxReadingGradeLevel": 5, "maxWordCount": 80}', // missing more fields
        '{"maxReadingGradeLevel": "not a number", "maxWordCount": 80, "minFindingReferences": 2, "maxSpamRiskScore": 30, "minQualityScore": 90, "jargonWordList": [], "dimensionWeights": {"readability": 25, "wordCount": 20, "jargon": 20, "findingRefs": 20, "spamRisk": 15}}',
      ];
      
      for (const invalid of invalidConfigs) {
        expect(() => deserializeConfig(invalid)).toThrow();
      }
    });

    it('throws on invalid field types', () => {
      const invalidTypeConfigs = [
        // jargonWordList not an array
        '{"maxReadingGradeLevel": 5, "maxWordCount": 80, "minFindingReferences": 2, "maxSpamRiskScore": 30, "minQualityScore": 90, "jargonWordList": "not an array", "dimensionWeights": {"readability": 25, "wordCount": 20, "jargon": 20, "findingRefs": 20, "spamRisk": 15}}',
        // dimensionWeights not an object
        '{"maxReadingGradeLevel": 5, "maxWordCount": 80, "minFindingReferences": 2, "maxSpamRiskScore": 30, "minQualityScore": 90, "jargonWordList": [], "dimensionWeights": "not an object"}',
        // missing dimension weight
        '{"maxReadingGradeLevel": 5, "maxWordCount": 80, "minFindingReferences": 2, "maxSpamRiskScore": 30, "minQualityScore": 90, "jargonWordList": [], "dimensionWeights": {"readability": 25, "wordCount": 20, "jargon": 20, "findingRefs": 20}}',
      ];
      
      for (const invalid of invalidTypeConfigs) {
        expect(() => deserializeConfig(invalid)).toThrow();
      }
    });

    it('serialized format is human-readable JSON', () => {
      fc.assert(
        fc.property(emailQAConfigArb, (config) => {
          const serialized = serializeConfig(config);
          
          // Should be formatted JSON (contains newlines and indentation)
          expect(serialized).toContain('\n');
          expect(serialized).toContain('  ');
          
          // Should be parseable
          const parsed = JSON.parse(serialized);
          expect(parsed).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });
  });
});
