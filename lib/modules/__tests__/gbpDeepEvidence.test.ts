/**
 * Wave 3 (P1-31) regression fixture: gbpDeep previously built 3 findings with
 * `evidence: []` (Description Missing, Missing Attributes, and the fabricated "GBP
 * Analysis Failed" finding on module failure). Every legitimate finding must now carry
 * real evidence identifying the fetched Places API record.
 */
import { describe, expect, it } from 'vitest';

import { validateFinding } from '@/lib/audit/findingContract';

import { generateGbpFindings, type GbpDeepAnalysis } from '../gbpDeep';

const PLACE_POINTER = 'https://places.googleapis.com/v1/places/abc123';
const COLLECTED_AT = new Date().toISOString();

const baseAnalysis: GbpDeepAnalysis = {
  completeness: {
    score: 40,
    missingFields: ['Business Description', 'Attributes (Payment/Access)'],
    nameConsistency: true,
    descriptionPresent: false,
    attributesPresent: false,
    openingDatePresent: false,
  },
  photos: { totalCount: 2, hasLogo: false, hasCover: false, recentPhotoCount: 0 },
  reviews: {
    totalCount: 20,
    rating: 4.2,
    velocity: 0.5,
    daysSinceLastReview: 120,
    ownerResponseRate: -1,
    avgResponseLength: 0,
    sentiment: { positiveKeywords: [], negativeKeywords: [] },
  },
  claimedStatus: { value: null, basis: 'unavailable' },
  primaryCategory: 'Dental clinic',
  secondaryCategories: [],
};

describe('generateGbpFindings (P1-31 regression)', () => {
  it('"Critical: Business Description Missing" carries real Places API evidence', () => {
    const findings = generateGbpFindings(baseAnalysis, PLACE_POINTER, COLLECTED_AT);
    const finding = findings.find((f) => f.title.includes('Description Missing'));
    expect(finding).toBeDefined();
    expect(finding!.evidence.length).toBeGreaterThan(0);
    expect((finding!.evidence[0] as { pointer: string }).pointer).toContain(PLACE_POINTER);
    expect(validateFinding({ ...finding, module: 'gbpDeep' }).success).toBe(true);
  });

  it('"Missing Business Attributes" carries real Places API evidence', () => {
    const findings = generateGbpFindings(baseAnalysis, PLACE_POINTER, COLLECTED_AT);
    const finding = findings.find((f) => f.title === 'Missing Business Attributes');
    expect(finding).toBeDefined();
    expect(finding!.evidence.length).toBeGreaterThan(0);
    expect(validateFinding({ ...finding, module: 'gbpDeep' }).success).toBe(true);
  });

  it('every finding produced passes the runtime Finding contract', () => {
    const findings = generateGbpFindings(baseAnalysis, PLACE_POINTER, COLLECTED_AT);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(validateFinding({ ...f, module: 'gbpDeep' }).success).toBe(true);
    }
  });

  it('the AI-photo-quality finding pointer is the real photo URL, not a placeholder', () => {
    const analysis: GbpDeepAnalysis = {
      ...baseAnalysis,
      photos: {
        ...baseAnalysis.photos,
        aiAnalysis: [
          {
            photoUrl: 'https://places.googleapis.com/v1/places/abc123/photos/xyz/media',
            scores: { quality: 3, relevance: 5, professionalism: 4 },
            type: 'Interior',
            flags: ['Blurry'],
          },
        ],
      },
    };
    const findings = generateGbpFindings(analysis, PLACE_POINTER, COLLECTED_AT);
    const finding = findings.find((f) => f.title === 'Low-Quality Profile Photos');
    expect(finding).toBeDefined();
    expect((finding!.evidence[0] as { pointer: string }).pointer).toContain('/photos/xyz/media');
    expect(validateFinding({ ...finding, module: 'gbpDeep' }).success).toBe(true);
  });
});
