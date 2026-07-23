import { describe, it, expect } from 'vitest';
import { runAutoQA } from '../qa/autoQA';

describe('AutoQA System', () => {
    it('should pass a rubric-compliant proposal without hard-fails', () => {
        const mockProposal: any = {
            executiveSummary:
                'Test Biz in Test City is underperforming at 34/100 performance, 4.2 seconds load time, and only 17 reviews, which is reducing leads and conversion; Rival Dental is ahead on local visibility.',
            tiers: {
                essentials: {
                    findingIds: ['1', '2'],
                    roi: { scenarios: { best: 3200, base: 2400, worst: 1400, assumptions: ['A1', 'A2'] } },
                },
                growth: {
                    findingIds: ['1', '2', '3'],
                    roi: { scenarios: { best: 5200, base: 4100, worst: 2500, assumptions: ['A1', 'A2'] } },
                },
                premium: {
                    findingIds: ['1', '2', '3'],
                    roi: { scenarios: { best: 7800, base: 6200, worst: 3600, assumptions: ['A1', 'A2'] } },
                },
            },
            pricing: { essentials: 500, growth: 1000, premium: 2000 },
            assumptions: ['Assumption 1', 'Assumption 2'],
            nextSteps: [
                'Top Action 1: Fix title tags | Impact: 9/10 | Effort: LOW | Timeline: 7 days',
                'Top Action 2: Speed optimization | Impact: 8/10 | Effort: MEDIUM | Timeline: 14-21 days',
                'Top Action 3: GBP review growth | Impact: 8/10 | Effort: MEDIUM | Timeline: 14-21 days',
                'Reply to approve the Growth plan and we can start this week.',
            ],
        };
        const mockFindings: any[] = [
            {
                id: '1',
                module: 'website',
                title: 'Slow load speed',
                impactScore: 9,
                type: 'PAINKILLER',
                evidence: [{ pointer: 'psi:lcp', collected_at: '2026-02-17T00:00:00.000Z' }],
            },
            {
                id: '2',
                module: 'seo',
                title: 'Weak local SEO signals',
                impactScore: 8,
                type: 'PAINKILLER',
                evidence: [{ pointer: 'serp:local_rank', collected_at: '2026-02-17T00:00:00.000Z' }],
            },
            {
                id: '3',
                module: 'reputation',
                title: 'Low review volume',
                impactScore: 7,
                type: 'VITAMIN',
                evidence: [{ pointer: 'gbp:reviews', collected_at: '2026-02-17T00:00:00.000Z' }],
            },
        ];

        const result = runAutoQA(mockProposal, mockFindings, 'Test Biz', 'Test City', {
            industry: 'Dental Clinic',
            comparisonReport: {
                prospect: { name: 'Test Biz' },
                competitors: [{ name: 'Rival Dental' }],
                prospectRank: 2,
                winningCategories: [],
                losingCategories: ['reviews'],
                biggestGap: null,
                summaryStatement: '',
                positiveStatement: '',
                urgencyStatement: '',
                quickWins: [],
            },
        });

        expect(result.score).toBeGreaterThan(0);
        expect(result.clientPerfect.hardFails).toHaveLength(0);
        expect(result.warnings).toBeInstanceOf(Array);
    });

    it('should hard-fail a generic summary with no quantified impact', () => {
        const mockProposal: any = {
            executiveSummary: 'This business has some issues and should improve.',
            tiers: {
                essentials: { findingIds: ['1'], roi: { scenarios: { best: 100, base: 80, worst: 60, assumptions: ['A1', 'A2'] } } },
                growth: { findingIds: ['1'], roi: { scenarios: { best: 120, base: 90, worst: 70, assumptions: ['A1', 'A2'] } } },
                premium: { findingIds: ['1'], roi: { scenarios: { best: 140, base: 100, worst: 80, assumptions: ['A1', 'A2'] } } },
            },
            pricing: { essentials: 500, growth: 1000, premium: 2000 },
            assumptions: ['Assumption 1', 'Assumption 2'],
            nextSteps: ['Reply to start.'],
        };
        const mockFindings: any[] = [
            {
                id: '1',
                module: 'website',
                title: 'Slow load speed',
                impactScore: 9,
                type: 'PAINKILLER',
                evidence: [{ pointer: 'psi:lcp', collected_at: '2026-02-17T00:00:00.000Z' }],
            },
        ];

        const result = runAutoQA(mockProposal, mockFindings, 'Test Biz', 'Test City');
        expect(result.score).toBe(0);
        expect(result.clientPerfect.hardFails.some((f) => f.code === 'GENERIC_SUMMARY_NO_IMPACT')).toBe(true);
    });
});
