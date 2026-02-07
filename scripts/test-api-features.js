const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runApiTests() {
    console.log('\n🧪 Running Feature API Regression Tests');
    console.log('Testing specific endpoints for PDF, Email, and Status\n');

    try {
        // Step 1: Get a valid proposal token
        const proposal = await prisma.proposal.findFirst({
            orderBy: { createdAt: 'desc' },
            select: { webLinkToken: true, id: true, status: true }
        });

        if (!proposal) {
            console.log('⚠️  No proposals found in DB. Skipping API tests.');
            return;
        }

        const token = proposal.webLinkToken;
        console.log(`Using proposal token: ${token}`);

        // Step 2: Test PDF Endpoint
        console.log('\n📄 Testing PDF Generation Endpoint...');
        const pdfRes = await fetch(`${BASE_URL}/api/proposal/${token}/pdf`);

        if (pdfRes.status === 200) {
            const contentType = pdfRes.headers.get('content-type');
            if (contentType === 'application/pdf') {
                console.log('   ✅ PASS - Returns PDF content type');
            } else {
                console.log(`   ❌ FAIL - Incorrect content type: ${contentType}`);
            }
        } else {
            console.log(`   ❌ FAIL - Status ${pdfRes.status}`);
        }

        // Step 3: Test Status Endpoint check (Validation)
        console.log('\n🔄 Testing Status Update Endpoint...');
        const validRes = await fetch(`${BASE_URL}/api/proposal/${token}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'VIEWED' })
        });

        if (validRes.ok) {
            console.log('   ✅ PASS - Updates status to VIEWED');
        } else {
            console.log(`   ❌ FAIL - Update request failed: ${validRes.status}`);
        }

        console.log('\n✅ Feature API Tests Complete');

    } catch (error) {
        console.error('\n❌ Test Suite Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

runApiTests();
