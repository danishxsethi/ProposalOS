import { describe, it, expect, vi } from 'vitest';
import { runDiagnosisPipeline } from '../diagnosis';
import { CostTracker } from '../costs/costTracker';

// Mock LLM clustering
vi.mock('../diagnosis/llmCluster', () => ({
    llmClusterFindings: vi.fn().mockResolvedValue([
        {
            id: 'cluster-1',
            rootCause: 'SEO Issues',
            severity: 'high' as const,
            findingIds: ['1'],
            narrative: 'Low visibility affects revenue'
        }
    ]),
    generateNarratives: vi.fn().mockImplementation((clusters: any[]) => Promise.resolve(clusters))
}));

describe('Diagnosis Pipeline', () => {
    it('should process findings and return clusters', async () => {
        const mockFindings: any[] = [
            { id: '1', title: 'Slow LCP', impactScore: 90, type: 'PAINKILLER' },
            { id: '2', title: 'Missing Alt Text', impactScore: 30, type: 'VITAMIN' }
        ];

        const tracker = new CostTracker();
        const result = await runDiagnosisPipeline(mockFindings, tracker);

        expect(result).toBeDefined();
        expect(result.clusters).toHaveLength(1);
        expect(result.clusters[0].rootCause).toBe('SEO Issues');
    });

    it('should handle empty findings gracefully', async () => {
        const tracker = new CostTracker();
        const result = await runDiagnosisPipeline([], tracker);
        expect(result.clusters).toEqual([]);
    });
});
