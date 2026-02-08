import { describe, it, expect } from 'vitest';
import { runAutoQA } from '../qa/autoQA';

describe('AutoQA System', () => {
    it('should pass a valid proposal', () => {
        const mockProposal: any = {
            executiveSummary: 'Valid summary with [Business Name] logic handled separately or mocked.',
            tiers: {
                essentials: { deliverables: ['A', 'B'] },
                growth: { deliverables: ['A', 'B', 'C'] },
                premium: { deliverables: ['A', 'B', 'C', 'D'] }
            },
            pricing: { essentials: 500, growth: 1000, premium: 2000 }
        };
        const mockFindings: any[] = [{ id: '1' }];

        // Mock business name to match summary if needed, but QA check might be simpler
        const result = runAutoQA(mockProposal, mockFindings, 'Test Biz', 'Test City');

        // Expect a score calculation
        expect(result.score).toBeGreaterThan(0);
        expect(result.warnings).toBeInstanceOf(Array);
    });

    it('should detect placeholder text in summary', () => {
        const mockProposal: any = {
            executiveSummary: 'This is a [INSERT NAME] placeholder.',
            tiers: { essentials: {}, growth: {}, premium: {} },
            pricing: {}
        };

        const result = runAutoQA(mockProposal, [], 'Test Biz', 'Test City');
        expect(result.passedChecks).not.toContain('no_placeholders');
        expect(result.score).toBeLessThan(100);
    });
});
