const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Real Estate Agent - Should trigger 'real_estate' industry and high-ticket pricing
const TARGET_BUSINESS = {
    name: 'ReMax Hallmark Realty',
    city: 'Toronto, ON'
};

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runTest() {
    console.log(`\n🧪 Testing New Industry: Real Estate`);
    console.log(`Target: ${TARGET_BUSINESS.name} (${TARGET_BUSINESS.city})\n`);

    try {
        // Step 1: Create Audit
        console.log('1. Creating Audit...');
        const createRes = await fetch(`${BASE_URL}/api/audit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TARGET_BUSINESS)
        });

        if (!createRes.ok) throw new Error(`Audit creation failed: ${createRes.status}`);
        const audit = await createRes.json();
        const auditId = audit.auditId; // API returns auditId
        console.log(`   ✓ Audit ID: ${auditId}`);

        // Step 2: Poll for completion
        console.log('2. Waiting for Audit Completion...');
        let status = 'QUEUED';
        let retries = 0;
        while (status !== 'COMPLETE' && status !== 'FAILED' && retries < 30) {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(`${BASE_URL}/api/audit/${auditId}`);
            const data = await pollRes.json();
            status = data.status;
            process.stdout.write('.');
            retries++;
        }
        console.log(`\n   ✓ Status: ${status}`);

        if (status === 'FAILED') throw new Error('Audit failed');

        // Step 3: Check Industry Detection
        const completedAudit = await prisma.audit.findUnique({ where: { id: auditId } });
        console.log(`\n3. Verifying Industry Detection...`);
        console.log(`   Detected Industry: "${completedAudit.businessIndustry}"`);

        // Note: It might be 'real_estate' or 'real estate agency' depending on Google Places match
        // But our logic maps specific keywords to 'real_estate' pricing key internally in the proposal generation
        // Let's see what the proposal actually uses.

        // Step 4: Generate Proposal
        console.log('\n4. Generating Proposal...');
        const propRes = await fetch(`${BASE_URL}/api/audit/${auditId}/propose`, {
            method: 'POST'
        });

        if (!propRes.ok) throw new Error(`Proposal generation failed: ${propRes.status}`);
        const proposalData = await propRes.json();
        const token = proposalData.webLinkToken;

        // Fetch full proposal from DB to check pricing
        const proposal = await prisma.proposal.findUnique({
            where: { webLinkToken: token }
        });

        const pricing = proposal.pricing;
        console.log('\n5. Verifying Pricing...');
        console.log(`   Essentials: $${pricing.essentials}`);
        console.log(`   Growth:     $${pricing.growth}`);
        console.log(`   Premium:    $${pricing.premium}`);

        // Verification Logic
        // Real Estate Pricing from pricing.ts:
        // essentials: 600, growth: 1500, premium: 3000
        if (pricing.essentials === 600 && pricing.growth === 1500 && pricing.premium === 3000) {
            console.log('\n✅ PASS - Correct Real Estate Pricing Applied!');
        } else {
            console.log('\n❌ FAIL - Pricing mismatch (Expected 600/1500/3000)');
            console.log('   (Likely fell back to general pricing: 450/1000/2000)');
        }

    } catch (error) {
        console.error('\n❌ Test Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runTest();
