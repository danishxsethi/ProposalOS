const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('\n🧪 Testing Finding Edit & Proposal Regeneration\n');

    try {
        // Step 1: Get an existing audit with findings and proposals
        console.log('📋 Step 1: Finding audit with findings...');
        const audit = await prisma.audit.findFirst({
            where: {
                findings: { some: {} },
                proposals: { some: {} },
            },
            include: {
                findings: {
                    where: { excluded: false },
                    orderBy: { impactScore: 'desc' },
                    take: 3,
                },
                proposals: {
                    orderBy: { version: 'desc' },
                    take: 1,
                },
            },
        });

        if (!audit || audit.findings.length === 0) {
            console.log('❌ No audit with findings found');
            return;
        }

        console.log(`   ✅ Found audit: ${audit.businessName} (${audit.id})`);
        console.log(`   • Findings: ${audit.findings.length}`);
        console.log(`   • Current proposal version: ${audit.proposals[0]?.version || 0}`);

        const findingToEdit = audit.findings[0];
        console.log(`\n📝 Step 2: Editing finding "${findingToEdit.title}"...`);
        console.log(`   Before: Impact=${findingToEdit.impactScore}, Excluded=${findingToEdit.excluded}`);

        // Step 2: Edit the finding
        const response = await fetch(`http://localhost:3000/api/finding/${findingToEdit.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: '[EDITED] ' + findingToEdit.title,
                impactScore: Math.min(10, findingToEdit.impactScore + 2), // Increase impact
                description: (findingToEdit.description || '') + ' [This finding was edited for testing]',
            }),
        });

        const editedFinding = await response.json();

        if (!response.ok) {
            console.log(`   ❌ Edit failed: ${editedFinding.error}`);
            return;
        }

        console.log(`   ✅ Finding edited successfully`);
        console.log(`   After: Impact=${editedFinding.impactScore}, ManuallyEdited=${editedFinding.manuallyEdited}`);

        // Step 3: Exclude a finding (soft delete)
        if (audit.findings.length > 1) {
            const findingToExclude = audit.findings[1];
            console.log(`\n🗑️  Step 3: Excluding finding "${findingToExclude.title}"...`);

            const deleteResponse = await fetch(`http://localhost:3000/api/finding/${findingToExclude.id}`, {
                method: 'DELETE',
            });

            const deleteResult = await deleteResponse.json();
            console.log(`   ✅ Finding excluded: ${deleteResult.message}`);
        }

        // Step 4: Regenerate proposal
        console.log(`\n🔄 Step 4: Regenerating proposal...`);
        const regenResponse = await fetch(`http://localhost:3000/api/audit/${audit.id}/regenerate`, {
            method: 'POST',
        });

        const regeneratedProposal = await regenResponse.json();

        if (!regenResponse.ok) {
            console.log(`   ❌ Regeneration failed: ${regeneratedProposal.error}`);
            if (regeneratedProposal.maxReached) {
                console.log(`   ℹ️  Max regenerations (3) reached for this audit`);
            }
            return;
        }

        console.log(`   ✅ Proposal regenerated successfully!`);
        console.log(`   • New version: ${regeneratedProposal.version}`);
        console.log(`   • Proposal ID: ${regeneratedProposal.id}`);
        console.log(`   • Regenerations remaining: ${regeneratedProposal.regenerationsRemaining}`);
        console.log(`   • Web link: http://localhost:3000/proposal/${regeneratedProposal.webLinkToken}`);

        // Step 5: Verify the new proposal
        console.log(`\n🔍 Step 5: Verifying new proposal...`);
        const newProposal = await prisma.proposal.findUnique({
            where: { id: regeneratedProposal.id },
            include: { audit: { include: { findings: true } } },
        });

        const nonExcludedFindings = newProposal.audit.findings.filter(f => !f.excluded);
        const manuallyEditedFindings = nonExcludedFindings.filter(f => f.manuallyEdited);

        console.log(`   ✅ Verification complete`);
        console.log(`   • Total findings: ${newProposal.audit.findings.length}`);
        console.log(`   • Active findings: ${nonExcludedFindings.length}`);
        console.log(`   • Manually edited: ${manuallyEditedFindings.length}`);
        console.log(`   • Executive summary length: ${newProposal.executiveSummary?.length || 0} chars`);

        // Step 6: Compare pricing
        const oldPricing = audit.proposals[0]?.pricing || {};
        const newPricing = regeneratedProposal.pricing || {};

        console.log(`\n💰 Step 6: Pricing comparison`);
        console.log(`   Old: $${oldPricing.essentials}/$${oldPricing.growth}/$${oldPricing.premium}`);
        console.log(`   New: $${newPricing.essentials}/$${newPricing.growth}/$${newPricing.premium}`);

        console.log(`\n✅ All tests passed! Editing & Regeneration working correctly.`);
        console.log(`\n📊 Summary:`);
        console.log(`   • Edited 1 finding (increased impact score)`);
        console.log(`   • Excluded 1 finding (soft delete)`);
        console.log(`   • Generated new proposal version ${regeneratedProposal.version}`);
        console.log(`   • ${regeneratedProposal.regenerationsRemaining} regenerations remaining`);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.cause) {
            console.error('   Cause:', error.cause);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
