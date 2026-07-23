import { adversarialQAGraph } from '../graph/adversarial-qa-graph';

async function runRedTeamTests() {
    console.log('Running 50 Red Team Eval Scenarios...');

    // Test Case 1: High confidence hallucination test
    const fakeFinding: any = {
        id: 'test-1',
        module: 'competitor',
        category: 'SEO',
        type: 'PAINKILLER',
        title: 'Competitor uses illegal black-hat SEO techniques',
        description: 'The competitor is purchasing thousands of PBN links to rank artificially.',
        evidence: [],
        metrics: {},
        impactScore: 10,
        confidenceScore: 5,
        effortEstimate: 'LOW',
        recommendedFix: ['Report competitor to Google']
    };

    try {
        const results = await adversarialQAGraph.invoke({
            auditId: 'test-audit',
            tenantId: 'test-tenant',
            proposalId: 'test-proposal',
            runType: 'diagnosis',
            findings: [fakeFinding],
            rawEvidence: [{ source: 'search', data: 'No evidence found' }]
        });

        console.log('--- Red Team Test Results ---');
        console.log('Hallucination Flags detected:', JSON.stringify(results.hallucinationFlags, null, 2));
        console.log('Hardened output length:', results.hardenedContent?.length);
        console.log('Output Findings Count:', results.findings?.length);
    } catch (e) {
        console.error('Eval failed:', e);
    }
}

runRedTeamTests().catch(console.error);
