#!/usr/bin/env node
/**
 * Test script for audit endpoint
 * Usage: node scripts/test-audit.js
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testAudit() {
    console.log('🧪 Testing Audit Endpoint...\n');

    // Test data
    const payload = {
        name: 'Joes Plumbing',
        city: 'Saskatoon',
        url: 'https://www.google.com', // Using Google as a test URL that will definitely work
    };

    try {
        console.log(`📤 POST ${BASE_URL}/api/audit`);
        console.log('Payload:', JSON.stringify(payload, null, 2));
        console.log('\n⏳ Running audit (this may take 10-20 seconds)...\n');

        const response = await fetch(`${BASE_URL}/api/audit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Error:', data);
            process.exit(1);
        }

        console.log('✅ Audit Complete!\n');
        console.log('Results:', JSON.stringify(data, null, 2));
        console.log('\n📊 Summary:');
        console.log(`  Audit ID: ${data.auditId}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Modules Completed: ${data.modulesCompleted?.join(', ') || 'none'}`);
        console.log(`  Findings: ${data.findingsCount || 0}`);

        if (data.modulesFailed && data.modulesFailed.length > 0) {
            console.log(`\n⚠️  Modules Failed:`, data.modulesFailed);
        }

        // Fetch full audit details
        console.log(`\n📥 Fetching audit details...`);
        const detailsResponse = await fetch(`${BASE_URL}/api/audit/${data.auditId}`);
        const auditDetails = await detailsResponse.json();

        console.log(`\n📄 Audit Details:`);
        console.log(`  Business: ${auditDetails.businessName}`);
        console.log(`  City: ${auditDetails.businessCity || 'N/A'}`);
        console.log(`  URL: ${auditDetails.businessUrl || 'N/A'}`);
        console.log(`  Findings Count: ${auditDetails.findings?.length || 0}`);

        if (auditDetails.findings && auditDetails.findings.length > 0) {
            console.log(`\n🔍 Sample Findings:`);
            auditDetails.findings.slice(0, 3).forEach((f, i) => {
                console.log(`  ${i + 1}. [${f.type}] ${f.title}`);
                console.log(`     Impact: ${f.impactScore}/10 | Confidence: ${f.confidenceScore}/10`);
            });
        }

        console.log('\n✅ All tests passed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testAudit();
