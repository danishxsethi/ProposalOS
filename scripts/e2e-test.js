#!/usr/bin/env node
/**
 * End-to-End Test Script for ProposalOS
 * 
 * Tests the full audit → diagnose → propose pipeline
 * 
 * Usage: node scripts/e2e-test.js [--base-url=http://localhost:3000]
 */

const BASE_URL = process.env.BASE_URL || process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'http://localhost:3000';

// Test businesses
const TEST_BUSINESSES = [
    {
        name: 'Joes Plumbing',
        city: 'Saskatoon',
        url: 'https://www.google.com', // Will work for PageSpeed test
        industry: 'trades',
    },
    {
        name: 'Main Street Dental',
        city: 'Toronto',
        url: null, // GBP-only test
        industry: 'dental',
    },
];

async function runTest(business, testNum) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST ${testNum}: ${business.name} in ${business.city}`);
    console.log(`${'='.repeat(60)}\n`);

    const results = {
        audit: { passed: false, duration: 0, findingsCount: 0 },
        diagnose: { passed: false, duration: 0, clustersCount: 0 },
        propose: { passed: false, duration: 0 },
    };

    try {
        // Step 1: Create Audit
        console.log('📊 Step 1: Creating audit...');
        const auditStart = Date.now();

        const auditRes = await fetch(`${BASE_URL}/api/audit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: business.name,
                city: business.city,
                url: business.url || undefined,
                industry: business.industry,
            }),
        });

        const auditData = await auditRes.json();
        results.audit.duration = Date.now() - auditStart;

        if (!auditRes.ok || !auditData.auditId) {
            throw new Error(`Audit failed: ${JSON.stringify(auditData)}`);
        }

        results.audit.passed = true;
        results.audit.findingsCount = auditData.findingsCount || 0;
        console.log(`   ✓ Audit created: ${auditData.auditId}`);
        console.log(`   ✓ Findings: ${auditData.findingsCount}`);
        console.log(`   ✓ Duration: ${results.audit.duration}ms`);

        // Step 2: Run Diagnosis
        console.log('\n🔍 Step 2: Running diagnosis...');
        const diagnoseStart = Date.now();

        const diagnoseRes = await fetch(`${BASE_URL}/api/audit/${auditData.auditId}/diagnose`, {
            method: 'POST',
        });

        const diagnoseData = await diagnoseRes.json();
        results.diagnose.duration = Date.now() - diagnoseStart;

        if (!diagnoseRes.ok) {
            throw new Error(`Diagnosis failed: ${JSON.stringify(diagnoseData)}`);
        }

        results.diagnose.passed = true;
        results.diagnose.clustersCount = diagnoseData.diagnosis?.clusters?.length || 0;
        console.log(`   ✓ Clusters: ${results.diagnose.clustersCount}`);
        console.log(`   ✓ Confidence: ${diagnoseData.diagnosis?.metadata?.clusteringConfidence || 'N/A'}`);
        console.log(`   ✓ Duration: ${results.diagnose.duration}ms`);

        // Step 3: Generate Proposal
        console.log('\n📝 Step 3: Generating proposal...');
        const proposeStart = Date.now();

        const proposeRes = await fetch(`${BASE_URL}/api/audit/${auditData.auditId}/propose`, {
            method: 'POST',
        });

        const proposeData = await proposeRes.json();
        results.propose.duration = Date.now() - proposeStart;

        if (!proposeRes.ok) {
            throw new Error(`Proposal failed: ${JSON.stringify(proposeData)}`);
        }

        results.propose.passed = true;
        console.log(`   ✓ Proposal ID: ${proposeData.proposalId}`);
        console.log(`   ✓ Executive Summary: ${proposeData.proposal?.executiveSummary?.slice(0, 80)}...`);
        console.log(`   ✓ Pricing: $${proposeData.proposal?.pricing?.essentials}/$${proposeData.proposal?.pricing?.growth}/$${proposeData.proposal?.pricing?.premium}`);
        console.log(`   ✓ Duration: ${results.propose.duration}ms`);

        // Summary
        console.log(`\n✅ TEST ${testNum} PASSED`);
        console.log(`   Total Duration: ${results.audit.duration + results.diagnose.duration + results.propose.duration}ms`);

        return { success: true, results };

    } catch (error) {
        console.log(`\n❌ TEST ${testNum} FAILED`);
        console.log(`   Error: ${error.message}`);
        return { success: false, error: error.message, results };
    }
}

async function runAllTests() {
    console.log('\n🧪 ProposalOS End-to-End Test Suite');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Tests: ${TEST_BUSINESSES.length}`);
    console.log('');

    // Check server health first
    try {
        const healthRes = await fetch(`${BASE_URL}/api/health`);
        if (!healthRes.ok) {
            throw new Error('Health check failed');
        }
        console.log('✓ Server is healthy\n');
    } catch (error) {
        console.error('❌ Server health check failed. Is the server running?');
        console.error(`   Make sure to run: npm run dev\n`);
        process.exit(1);
    }

    const testResults = [];

    for (let i = 0; i < TEST_BUSINESSES.length; i++) {
        const result = await runTest(TEST_BUSINESSES[i], i + 1);
        testResults.push(result);
    }

    // Final Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('FINAL SUMMARY');
    console.log(`${'='.repeat(60)}\n`);

    const passed = testResults.filter(r => r.success).length;
    const failed = testResults.length - passed;

    console.log(`Passed: ${passed}/${testResults.length}`);
    console.log(`Failed: ${failed}/${testResults.length}`);

    if (failed > 0) {
        console.log('\n❌ Some tests failed. Check the output above for details.');
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed!');
        process.exit(0);
    }
}

runAllTests();
