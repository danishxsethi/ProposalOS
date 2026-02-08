import { runAutoQA } from '../lib/qa/autoQA';
import { Finding, FindingType, EffortLevel } from '@prisma/client';
import { ProposalResult } from '../lib/proposal/types';

// Mock Findings
const findings: Finding[] = [
    {
        id: 'f1',
        auditId: 'audit1',
        module: 'website',
        category: 'performance',
        type: 'PAINKILLER',
        title: 'Slow Loading Speed',
        description: 'Page takes 5s to load',
        evidence: [{ url: 'http://example.com', raw: {} }],
        metrics: {},
        impactScore: 8,
        confidenceScore: 9,
        effortEstimate: 'LOW',
        recommendedFix: [],
        manuallyEdited: false,
        excluded: false,
        createdAt: new Date()
    },
    {
        id: 'f2',
        auditId: 'audit1',
        module: 'gbp',
        category: 'visibility',
        type: 'VITAMIN',
        title: 'Missing Photos',
        description: 'Add more photos',
        evidence: [{ source: 'google_maps' }],
        metrics: {},
        impactScore: 5,
        confidenceScore: 8,
        effortEstimate: 'MEDIUM',
        recommendedFix: [],
        manuallyEdited: false,
        excluded: false,
        createdAt: new Date()
    },
    {
        id: 'f3',
        auditId: 'audit1',
        module: 'competitor',
        category: 'ranking',
        type: 'PAINKILLER',
        title: 'Not in Local Pack',
        description: 'Competitors rank higher',
        evidence: [{ source: 'serpapi' }],
        metrics: {},
        impactScore: 9,
        confidenceScore: 9,
        effortEstimate: 'HIGH',
        recommendedFix: [],
        manuallyEdited: false,
        excluded: false,
        createdAt: new Date()
    }
];

// Mock Proposal
const proposal: ProposalResult = {
    executiveSummary: "Joe's Plumbing has critical issues. We found 3 findings. The city of Saskatoon is huge.",
    painClusters: [],
    tiers: {
        essentials: {
            name: "Essentials",
            description: "Desc",
            price: 500,
            deliveryTime: "1wk",
            findingIds: ['f1', 'f2']
        },
        growth: {
            name: "Growth",
            description: "Desc",
            price: 1000,
            deliveryTime: "2wks",
            findingIds: ['f1', 'f2', 'f3']
        },
        premium: {
            name: "Premium",
            description: "Desc",
            price: 2000,
            deliveryTime: "3wks",
            findingIds: ['f1', 'f2', 'f3']
        }
    },
    pricing: { essentials: 500, growth: 1000, premium: 2000, currency: 'USD' },
    assumptions: [],
    disclaimers: [],
    nextSteps: []
};

console.log("Running QA Test...");

const result = runAutoQA(proposal, findings, "Joe's Plumbing", "Saskatoon");

console.log(`QA Score: ${result.score}%`);
console.log(`Passed: ${result.passedChecks}/${result.totalChecks}`);
console.log("Warnings:", result.warnings);
console.log("Results:");
result.results.forEach(r => {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.category} - ${r.check}: ${r.details}`);
});

if (result.score >= 80) {
    console.log("\n✅ Test Passed (High Quality)");
} else {
    console.log("\n❌ Test Failed (Low Quality)");
}
