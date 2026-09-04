import { describe, expect, it } from 'vitest';
import { generateFullSequence, renderSequenceTouch, VERTICAL_COPY_PROFILES } from '../copyEngine';

describe('Elite Copy Engine & Sequence Generator', () => {
  const park56Data = {
    businessName: 'Park 56 Dental',
    decisionMakerName: 'Dr. Howard',
    city: 'New York',
    vertical: 'dental',
    topFindingTitle: 'Competitors have 342 more reviews on average',
    topFindingDollars: 3200,
    competitorName: 'Pearl Dental NYC',
  };

  const blinkFitnessData = {
    businessName: 'Blink Fitness',
    city: 'New York',
    vertical: 'fitness',
    topFindingTitle: 'Missing meta tags and unintegrated trial capture',
    topFindingDollars: 1800,
  };

  const joesPizzaData = {
    businessName: "Joe's Pizza",
    decisionMakerName: 'Joe',
    city: 'New York',
    vertical: 'restaurant',
    topFindingTitle: 'Missing Restaurant & Menu schema',
    topFindingDollars: 2100,
  };

  it('renders Email 1 under 90 words with zero links and zero spam words across all verticals', () => {
    const testCases = [
      { name: 'Dental (Park 56)', data: park56Data },
      { name: 'Fitness (Blink Fitness)', data: blinkFitnessData },
      { name: 'Restaurant (Joe\'s Pizza)', data: joesPizzaData },
      { name: 'Empty Fallback', data: {} },
    ];

    for (const tc of testCases) {
      for (const variant of ['A', 'B', 'C'] as const) {
        const email1 = renderSequenceTouch({
          touchType: 'INITIAL',
          source: tc.data,
          variant,
        });

        expect(email1.wordCount, `${tc.name} Variant ${variant} exceeds 90 words`).toBeLessThan(90);
        expect(email1.hasLinks, `${tc.name} Variant ${variant} should have 0 links`).toBe(false);
        expect(email1.containsSpamWords, `${tc.name} Variant ${variant} contains spam words`).toBe(false);
        expect(email1.body).not.toMatch(/{{\s*[\w\.]+\s*}}/);
        expect(email1.subject).not.toMatch(/{{\s*[\w\.]+\s*}}/);
      }
    }
  });

  it('generates a full 5-touch sequence with 3-4 day spacing (Days 0, 3, 7, 11, 15)', () => {
    const sequence = generateFullSequence(park56Data, 'A');

    expect(sequence).toHaveLength(5);
    expect(sequence.map((s) => s.dayOffset)).toEqual([0, 3, 7, 11, 15]);
    expect(sequence[0].type).toBe('INITIAL');
    expect(sequence[1].type).toBe('FOLLOWUP_NEW_FINDING');
    expect(sequence[2].type).toBe('FOLLOWUP_DIY_QUICK_WIN');
    expect(sequence[3].type).toBe('FOLLOWUP_SOCIAL_PROOF');
    expect(sequence[4].type).toBe('FOLLOWUP_BREAKUP');
  });

  it('provides 3 distinct subject line variants per touch across all profiles', () => {
    for (const [key, profile] of Object.entries(VERTICAL_COPY_PROFILES)) {
      for (const [touchKey, touchDef] of Object.entries(profile.touches)) {
        const subjects = [
          touchDef.variants.A.subject,
          touchDef.variants.B.subject,
          touchDef.variants.C.subject,
        ];
        const unique = new Set(subjects);
        expect(
          unique.size,
          `Vertical ${key} touch ${touchKey} does not have 3 distinct subjects`
        ).toBe(3);
      }
    }
  });

  it('renders all 5 touches safely when input source is completely empty', () => {
    const sequence = generateFullSequence({}, 'B');

    for (const touch of sequence) {
      expect(touch.body).not.toMatch(/{{\s*[\w\.]+\s*}}/);
      expect(touch.subject).not.toMatch(/{{\s*[\w\.]+\s*}}/);
      expect(touch.body.length).toBeGreaterThan(30);
    }
  });
});
