import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDiagnosisPipeline } from '@/lib/diagnosis';
import { runProposalPipeline } from '@/lib/proposal';
import { CostTracker } from '@/lib/costs/costTracker';

/**
 * POST /api/audit/[id]/propose
 * Generate a proposal for an audit
 */
import { withAuth } from '@/lib/middleware/auth';

/**
 * POST /api/audit/[id]/propose
 * Generate a proposal for an audit
 */
export const POST = withAuth(async (
    req: Request,
    { params }: { params: { id: string } }
) => {
    try {
        const auditId = params.id;

        // Fetch audit with findings
        const audit = await prisma.audit.findUnique({
            where: { id: auditId },
            include: {
                findings: true,
            },
        });

        if (!audit) {
            return NextResponse.json(
                { error: 'Audit not found' },
                { status: 404 }
            );
        }

        if (audit.findings.length === 0) {
            return NextResponse.json(
                { error: 'No findings to generate proposal from' },
                { status: 400 }
            );
        }

        const tracker = new CostTracker();

        console.log(`[Propose] Generating proposal for audit ${auditId}...`);

        // Step 1: Run diagnosis to get clusters
        const diagnosisResult = await runDiagnosisPipeline(audit.findings, tracker);
        console.log(`[Propose] Diagnosis complete: ${diagnosisResult.clusters.length} clusters`);

        // Step 2: Generate proposal
        const proposalResult = await runProposalPipeline(
            audit.businessName,
            audit.businessIndustry || undefined,
            diagnosisResult.clusters,
            audit.findings,
            tracker
        );
        console.log(`[Propose] Proposal generated`);

        // Log costs
        console.log(`[Propose] Cost: ${tracker.getTotalCents()} cents`, tracker.getReport());

        // Step 3: Save proposal to database (serialize to JSON)
        const proposal = await prisma.proposal.create({
            data: {
                auditId,
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

        console.log(`[Propose] Proposal saved: ${proposal.id}`);

        return NextResponse.json({
            success: true,
            auditId,
            proposalId: proposal.id,
            webLinkToken: proposal.webLinkToken,
            proposal: proposalResult,
            costCents: tracker.getTotalCents(),
        });

    } catch (error) {
        console.error('[Propose] Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: String(error) },
            { status: 500 }
        );
    }
});
