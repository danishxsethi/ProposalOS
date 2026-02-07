import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runProposalPipeline } from '@/lib/proposal';
import { runDiagnosisPipeline } from '@/lib/diagnosis';
import { CostTracker } from '@/lib/costs/costTracker';
import { withAuth } from '@/lib/middleware/auth';

interface Params {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/audit/[id]/regenerate
 * Regenerate proposal with edited findings
 */
export const POST = withAuth(async (request: Request, { params }: Params) => {
    try {
        const { id: auditId } = await params;

        // Verify audit exists
        const audit = await prisma.audit.findUnique({
            where: { id: auditId },
            include: {
                findings: {
                    where: { excluded: false },
                    orderBy: { impactScore: 'desc' },
                },
                proposals: {
                    orderBy: { version: 'desc' },
                    take: 1,
                },
            },
        });

        if (!audit) {
            return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
        }

        if (audit.findings.length === 0) {
            return NextResponse.json(
                { error: 'No findings available for proposal generation' },
                { status: 400 }
            );
        }

        // Get next version number
        const currentVersion = audit.proposals[0]?.version || 0;
        const nextVersion = currentVersion + 1;

        // Check max regenerations (3 per spec)
        if (nextVersion > 3) {
            return NextResponse.json(
                {
                    error: 'Maximum regenerations (3) reached. Please edit findings manually.',
                    maxReached: true,
                },
                { status: 400 }
            );
        }

        const tracker = new CostTracker();

        console.log(`[Regenerate] Starting regeneration v${nextVersion} for audit ${auditId}`);

        // Re-run diagnosis with current (possibly edited) findings
        const diagnosisResult = await runDiagnosisPipeline(audit.findings, tracker);
        console.log(`[Regenerate] Diagnosis complete: ${diagnosisResult.clusters.length} clusters`);

        // Re-run proposal generation
        const proposalResult = await runProposalPipeline(
            audit.businessName,
            audit.businessIndustry || 'general',
            diagnosisResult.clusters,
            audit.findings,
            tracker
        );
        console.log(`[Regenerate] Proposal generated`);

        // Log costs
        console.log(`[Regenerate] Cost: ${tracker.getTotalCents()} cents`, tracker.getReport());

        // Save new proposal version
        const proposal = await prisma.proposal.create({
            data: {
                auditId,
                version: nextVersion,
                executiveSummary: proposalResult.executiveSummary,
                painClusters: JSON.parse(JSON.stringify(diagnosisResult.clusters)),
                tierEssentials: JSON.parse(JSON.stringify(proposalResult.tiers.essentials)),
                tierGrowth: JSON.parse(JSON.stringify(proposalResult.tiers.growth)),
                tierPremium: JSON.parse(JSON.stringify(proposalResult.tiers.premium)),
                pricing: JSON.parse(JSON.stringify(proposalResult.pricing)),
                assumptions: proposalResult.assumptions,
                disclaimers: proposalResult.disclaimers,
                nextSteps: proposalResult.nextSteps,
                status: 'DRAFT',
            },
        });

        // Update audit cost
        await prisma.audit.update({
            where: { id: auditId },
            data: {
                apiCostCents: { increment: tracker.getTotalCents() },
            },
        });

        console.log(`[Regenerate] New proposal saved: ${proposal.id} (v${nextVersion})`);

        return NextResponse.json({
            id: proposal.id,
            version: proposal.version,
            webLinkToken: proposal.webLinkToken,
            executiveSummary: proposal.executiveSummary?.slice(0, 200) + '...',
            pricing: proposal.pricing,
            regenerationsRemaining: 3 - nextVersion,
            costCents: tracker.getTotalCents(),
        });

    } catch (error) {
        console.error('[Regenerate] Error:', error);
        return NextResponse.json(
            { error: 'Failed to regenerate proposal' },
            { status: 500 }
        );
    }
});
