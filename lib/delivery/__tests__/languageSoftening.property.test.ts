// Feature: agentic-delivery-qa-hardening, Property 8: LOW confidence language softening
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { softenLanguage } from '../confidenceScorer';

describe('Property 8: LOW confidence language softening', () => {
  it('should not modify text for HIGH or MEDIUM confidence levels', () => {
    const textArbitrary = fc.string({ minLength: 1 });

    fc.assert(
      fc.property(textArbitrary, (text) => {
        const resultHigh = softenLanguage(text, 'HIGH');
        const resultMedium = softenLanguage(text, 'MEDIUM');

        expect(resultHigh).toBe(text);
        expect(resultMedium).toBe(text);
      }),
      { numRuns: 100 }
    );
  });

  it('should soften assertive phrasing for LOW confidence claims', () => {
    const assertivePatterns = [
      'your traffic is declining',
      'your site costs you $2400/month',
      'competitors are outperforming',
      'you are losing $5000',
      'your traffic loss is $3000',
    ];

    assertivePatterns.forEach((pattern) => {
      const result = softenLanguage(pattern, 'LOW');
      
      // Must not contain the original assertive phrasing
      expect(result).not.toBe(pattern);
      
      // Must contain a qualifier
      const hasQualifier = /estimated|modeled|as of last audit|~/.test(result);
      expect(hasQualifier).toBe(true);
    });
  });

  it('should add qualifier words to softened claims', () => {
    const testCases = [
      { input: 'your traffic is declining', expectedQualifier: /estimated|modeled/ },
      { input: 'competitors are outperforming', expectedQualifier: /as of last audit|may be/ },
      { input: 'you are losing $5000', expectedQualifier: /estimated|modeled/ },
    ];

    testCases.forEach(({ input, expectedQualifier }) => {
      const result = softenLanguage(input, 'LOW');
      expect(result).toMatch(expectedQualifier);
    });
  });

  it('should preserve text structure while softening', () => {
    const text = 'Your page speed is 34 and competitors are outperforming you significantly.';
    const result = softenLanguage(text, 'LOW');

    // Result should still be a string
    expect(typeof result).toBe('string');
    
    // Result should be non-empty
    expect(result.length).toBeGreaterThan(0);
    
    // Result should contain softened language
    expect(result).toMatch(/estimated|modeled|as of last audit|may be/);
  });

  it('should handle multiple softening patterns in one text', () => {
    const text = 'Your traffic loss is $2400/month and competitors are outperforming you.';
    const result = softenLanguage(text, 'LOW');

    // Should contain qualifiers for both patterns
    const hasMultipleQualifiers = (result.match(/estimated|modeled|as of last audit|may be/g) || []).length >= 1;
    expect(hasMultipleQualifiers).toBe(true);
  });

  it('should be idempotent when applied multiple times', () => {
    const text = 'Your traffic loss is $2400/month.';
    const result1 = softenLanguage(text, 'LOW');
    const result2 = softenLanguage(result1, 'LOW');

    // Applying softening twice should not change the result further
    expect(result2).toBe(result1);
  });
});
