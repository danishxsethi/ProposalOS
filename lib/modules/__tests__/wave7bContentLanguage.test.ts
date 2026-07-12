/**
 * Wave 7B — P2-38: contentQuality applied the English-specific Flesch-Kincaid
 * formula to every page regardless of language, with no detection step. Green-
 * after: `detectContentLanguage` prioritizes `<html lang>`, then a
 * content-language `<meta>` tag, then a bounded English-stopword heuristic, and
 * returns 'unknown' rather than guessing on short/ambiguous content. The
 * Flesch-Kincaid "Content Too Complex" Finding is only emitted for confidently
 * detected English content.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { detectContentLanguage, generateContentFindings } from '../contentQuality';
import type { ContentQualityModuleInput } from '../contentQuality';

describe('detectContentLanguage (P2-38)', () => {
  it('prioritizes <html lang> over any other signal', () => {
    const result = detectContentLanguage(
      [{ url: 'https://acme.test', html: '<html lang="fr"><body>Bonjour le monde</body></html>' }],
      'Bonjour le monde'
    );
    expect(result).toMatchObject({ code: 'fr', source: 'html_lang' });
  });

  it('falls back to content-language meta tag when no html lang is present', () => {
    const result = detectContentLanguage(
      [
        {
          url: 'https://acme.test',
          html: '<html><head><meta http-equiv="content-language" content="es-MX"></head><body>Hola</body></html>',
        },
      ],
      'Hola'
    );
    expect(result).toMatchObject({ code: 'es', source: 'content_language_meta' });
  });

  it('falls back to a bounded English-stopword heuristic with enough text and no explicit signal', () => {
    const englishText = Array(60)
      .fill(
        'the business is located and we have your services for the community and we call you today'
      )
      .join(' ');
    const result = detectContentLanguage(
      [{ url: 'https://acme.test', html: '<html><body>irrelevant</body></html>' }],
      englishText
    );
    expect(result.code).toBe('en');
    expect(result.source).toBe('heuristic_en_stopwords');
  });

  it('returns unknown (never guesses) for short/ambiguous content with no signal', () => {
    const result = detectContentLanguage(
      [{ url: 'https://acme.test', html: '<html><body>Hi</body></html>' }],
      'Hi'
    );
    expect(result.code).toBe('unknown');
  });

  it('tolerates malformed page html without throwing', () => {
    const result = detectContentLanguage(
      // @ts-expect-error — intentionally malformed input to prove no crash
      [{ url: 'https://acme.test', html: null }],
      'short'
    );
    expect(result.code).toBe('unknown');
  });
});

const baseInput: ContentQualityModuleInput = {
  url: 'https://acme.test/',
  businessName: 'Acme',
  industry: 'dental',
  city: 'Springfield',
};

function complexEnglishPage() {
  return {
    url: 'https://acme.test/',
    text: 'Sophisticated multidisciplinary orthodontic rehabilitation necessitates comprehensive interdisciplinary consultation among credentialed practitioners prior to definitive prosthodontic intervention.',
    title: 'Home',
  };
}

describe('generateContentFindings language gate (P2-38)', () => {
  it('emits the readability Finding for confidently-detected English content above grade 10', () => {
    const pageTexts = [complexEnglishPage()];
    const analysis = {
      pages: [
        {
          url: baseInput.url,
          clarity: 8,
          specificity: 8,
          localRelevance: 8,
          trustBuilding: 8,
          callToAction: 8,
          readability: 3,
          overallScore: 7,
        },
      ],
      primaryValueProp: 'We fix teeth',
      contentGaps: [],
      strongestPage: baseInput.url,
      weakestPage: baseInput.url,
      topRecommendations: [],
      readabilityMetrics: {
        fleschKincaidGrade: 18,
        avgSentenceLength: 30,
        avgWordLength: 8,
        passiveVoicePercentage: 0,
        totalWordCount: 200,
      },
      detectedLanguage: { code: 'en' as const, source: 'html_lang' as const, confidence: 95 },
    };
    const findings = generateContentFindings(analysis, baseInput, pageTexts);
    expect(findings.some((f) => f.title === 'Content Too Complex for General Audience')).toBe(true);
  });

  it('does NOT emit the readability Finding when language is unknown, even at a high grade level', () => {
    const pageTexts = [complexEnglishPage()];
    const analysis = {
      pages: [
        {
          url: baseInput.url,
          clarity: 8,
          specificity: 8,
          localRelevance: 8,
          trustBuilding: 8,
          callToAction: 8,
          readability: 3,
          overallScore: 7,
        },
      ],
      primaryValueProp: 'We fix teeth',
      contentGaps: [],
      strongestPage: baseInput.url,
      weakestPage: baseInput.url,
      topRecommendations: [],
      readabilityMetrics: {
        fleschKincaidGrade: 18,
        avgSentenceLength: 30,
        avgWordLength: 8,
        passiveVoicePercentage: 0,
        totalWordCount: 200,
      },
      detectedLanguage: { code: 'unknown' as const, source: 'unknown' as const, confidence: 0 },
    };
    const findings = generateContentFindings(analysis, baseInput, pageTexts);
    expect(findings.some((f) => f.title === 'Content Too Complex for General Audience')).toBe(
      false
    );
  });

  it('does NOT emit the readability Finding for non-English content even at a high numeric grade', () => {
    const pageTexts = [complexEnglishPage()];
    const analysis = {
      pages: [
        {
          url: baseInput.url,
          clarity: 8,
          specificity: 8,
          localRelevance: 8,
          trustBuilding: 8,
          callToAction: 8,
          readability: 3,
          overallScore: 7,
        },
      ],
      primaryValueProp: 'Nous réparons les dents',
      contentGaps: [],
      strongestPage: baseInput.url,
      weakestPage: baseInput.url,
      topRecommendations: [],
      readabilityMetrics: {
        fleschKincaidGrade: 22,
        avgSentenceLength: 35,
        avgWordLength: 9,
        passiveVoicePercentage: 0,
        totalWordCount: 200,
      },
      detectedLanguage: { code: 'fr' as const, source: 'html_lang' as const, confidence: 95 },
    };
    const findings = generateContentFindings(analysis, baseInput, pageTexts);
    expect(findings.some((f) => f.title === 'Content Too Complex for General Audience')).toBe(
      false
    );
  });
});
