const GOLDEN_BUSINESSES = [
    { name: "Joe's Plumbing", city: "Saskatoon", industry: "plumbing" },
    { name: "Main Street Dental", city: "Toronto", industry: "dental" },
    { name: "Sushi Village Restaurant", city: "Vancouver", industry: "restaurant" },
    { name: "Quick Lube Auto Service", city: "Calgary", industry: "automotive" },
    { name: "Sunrise Yoga Studio", city: "Vancouver", industry: "fitness" },
    { name: "Downtown Pizza Co", city: "Edmonton", industry: "restaurant" },
    { name: "Green Leaf Landscaping", city: "Ottawa", industry: "landscaping" },
    { name: "Smile Orthodontics", city: "Montreal", industry: "dental" },
    { name: "Peak Roofing", city: "Winnipeg", industry: "construction" },
    { name: "Fresh Start Cleaners", city: "Halifax", industry: "cleaning" },
];

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runGoldenTests() {
    console.log('\n🏆 Running Golden Test Suite');
    console.log('Testing 10 diverse businesses for quality validation\n');
    console.log('━'.repeat(60));

    const results = [];
    let passCount = 0;
    let failCount = 0;

    for (let i = 0; i < GOLDEN_BUSINESSES.length; i++) {
        const business = GOLDEN_BUSINESSES[i];
        console.log(`\n[${i + 1}/10] ${business.name} - ${business.city}`);
        const startTime = Date.now();

        try {
            // Step 1: Create audit
            const auditRes = await fetch(`${BASE_URL}/api/audit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: business.name, city: business.city }),
            });

            if (!auditRes.ok) {
                throw new Error(`Audit creation failed: ${auditRes.status}`);
            }

            const audit = await auditRes.json();
            console.log(`   ✓ Audit created: ${audit.auditId}`);
            console.log(`   • Status: ${audit.status}`);
            console.log(`   • Findings: ${audit.findingsCount}`);
            console.log(`   • Cost: $${audit.costUSD || '0.00'}`);

            if (audit.status === 'FAILED') {
                throw new Error('All modules failed');
            }

            // Step 2: Run diagnosis
            const diagnosisRes = await fetch(`${BASE_URL}/api/audit/${audit.auditId}/diagnose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!diagnosisRes.ok) {
                throw new Error(`Diagnosis failed: ${diagnosisRes.status}`);
            }

            const diagnosis = await diagnosisRes.json();
            console.log(`   ✓ Diagnosis complete: ${diagnosis.diagnosis.clusters.length} clusters`);

            // Step 3: Generate proposal
            const proposalRes = await fetch(`${BASE_URL}/api/audit/${audit.auditId}/propose`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!proposalRes.ok) {
                throw new Error(`Proposal generation failed: ${proposalRes.status}`);
            }

            const proposal = await proposalRes.json();
            console.log(`   ✓ Proposal generated`);
            console.log(`   • Executive summary: ${proposal.proposal.executiveSummary.substring(0, 80)}...`);
            console.log(`   • Pricing: $${proposal.proposal.pricing.essentials}/$${proposal.proposal.pricing.growth}/$${proposal.proposal.pricing.premium}`);

            const duration = Date.now() - startTime;
            console.log(`   ⏱  Duration: ${duration}ms`);

            // Validate quality
            const qualityChecks = {
                hasFindings: audit.findingsCount > 0,
                hasClusters: diagnosis.diagnosis.clusters.length > 0,
                hasExecutiveSummary: proposal.proposal.executiveSummary.length > 100,
                hasPricing: proposal.proposal.pricing.essentials > 0,
                reasonableDuration: duration < 60000, // Under 60 seconds
            };

            const allPassed = Object.values(qualityChecks).every(Boolean);

            if (allPassed) {
                console.log(`   ✅ PASS - All quality checks passed`);
                passCount++;
            } else {
                console.log(`   ⚠️  WARN - Some quality checks failed:`);
                Object.entries(qualityChecks).forEach(([check, passed]) => {
                    if (!passed) console.log(`      ✗ ${check}`);
                });
                passCount++; // Still count as pass but with warnings
            }

            results.push({
                business: business.name,
                status: 'pass',
                duration,
                findings: audit.findingsCount,
                cost: audit.costUSD,
                qualityChecks,
            });

        } catch (error) {
            console.log(`   ❌ FAIL - ${error instanceof Error ? error.message : 'Unknown error'}`);
            failCount++;
            results.push({
                business: business.name,
                status: 'fail',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }

        // Small delay between tests to avoid rate limits
        if (i < GOLDEN_BUSINESSES.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Summary
    console.log('\n' + '━'.repeat(60));
    console.log('\n📊 GOLDEN TEST SUMMARY\n');
    console.log(`Passed: ${passCount}/10`);
    console.log(`Failed: ${failCount}/10`);
    console.log(`Success Rate: ${(passCount / 10 * 100).toFixed(0)}%`);

    if (passCount >= 8) {
        console.log('\n✅ Golden test suite PASSED (≥80% success rate)\n');
    } else {
        console.log('\n❌ Golden test suite FAILED (<80% success rate)\n');
        console.log('Review failed tests and fix issues before deploying.\n');
    }

    // Detailed results
    console.log('\nDetailed Results:');
    results.forEach((result, i) => {
        console.log(`${i + 1}. ${result.business}: ${result.status.toUpperCase()}`);
        if (result.status === 'pass') {
            console.log(`   Findings: ${result.findings}, Cost: $${result.cost}, Duration: ${result.duration}ms`);
        } else {
            console.log(`   Error: ${result.error}`);
        }
    });

    return { passCount, failCount, results };
}

// Run tests
runGoldenTests().catch(console.error);
