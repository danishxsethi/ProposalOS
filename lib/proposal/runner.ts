import { prisma } from '@/lib/prisma';
// P0-3: Use LangGraph path
import { diagnosisGraph } from '@/lib/graph/diagnosis-graph';
import { runProposalPipeline } from '@/lib/proposal';
import { generateComparison } from '@/lib/analysis/competitorComparison';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { createParentTrace } from '@/lib/tracing';
import { RunTree } from 'langsmith';
import { sendProposalReady } from '@/lib/notifications/email';
import { sendWebhook } from '@/lib/notifications/webhook';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function generateProposal(auditId: string) {
    const startTime = Date.now();

    logger.info({
        event: 'proposal.start',
        auditId
    }, 'Starting proposal generation');

    // Fetch audit with findings
    const audit = await prisma.audit.findUnique({
        where: { id: auditId },
        include: {
            findings: true,
            evidence: {
                where: { module: 'competitor' },
                orderBy: { collectedAt: 'desc' },
                take: 1,
            },
        },
    });

    if (!audit) {
        throw new Error(`Audit ${auditId} not found`);
    }

    if (audit.findings.length === 0) {
        logger.warn({ auditId }, 'No findings to generate proposal from');
        return null;
    }

    const tracker = new CostTracker();

    // Create parent trace for this proposal generation flow
    let parentTrace: RunTree | undefined;
    try {
        parentTrace = await createParentTrace(auditId, "proposal-generation", {
            businessName: audit.businessName,
            industry: audit.businessIndustry,
            findingsCount: audit.findings.length
        });
    } catch (e) {
        console.error("Failed to create parent trace", e);
    }

    try {
        // Step 1: Run diagnosis to get clusters via LangGraph (P0-3)
        const diagnosisResult = await diagnosisGraph.invoke({
            findings: audit.findings,
            tenantId: audit.tenantId,
            auditId: audit.id,
            mode: 'MULTI_STEP',
            // Notice: tracker & parentTrace are not passed here yet since diagnosisGraph
            // doesn't natively support tracing/tracking in the same way, but it resolves
            // the P0-3 requirement to use the LangGraph pipeline with QA.
        });

        logger.info({
            event: 'diagnosis.complete',
            auditId,
            clusterCount: diagnosisResult.clusters?.length || 0,
            duration_ms: Date.now() - startTime
        }, 'Diagnosis complete');

        // Build comparison report from competitor evidence
        let comparisonReport = null;
        const competitorEvidence = audit.evidence?.[0]?.rawResponse as { comparisonMatrix?: { business?: unknown; competitors?: unknown[] } } | undefined;
        if (competitorEvidence?.comparisonMatrix?.business && competitorEvidence.comparisonMatrix.competitors?.length) {
            const { business, competitors } = competitorEvidence.comparisonMatrix;
            comparisonReport = generateComparison(
                business as Parameters<typeof generateComparison>[0],
                competitors as Parameters<typeof generateComparison>[1],
                audit.businessIndustry || undefined
            );
        }

        // Step 2: Generate proposal
        const pipelineResult = await runProposalPipeline(
            audit.businessName,
            audit.businessIndustry || undefined,
            diagnosisResult.clusters as any,
            audit.findings,
            tracker,
            parentTrace,
            undefined,
            comparisonReport,
            audit.businessCity
        );
        const { normalizedFindings: _nf, ...proposalResult } = pipelineResult;

        // Step 3: Save proposal to database (serialize to JSON)
        const proposal = await prisma.proposal.create({
            data: {
                auditId,
                tenantId: audit.tenantId, // Fixed TS error
                executiveSummary: proposalResult.executiveSummary,
                painClusters: diagnosisResult.clusters as any,
                tierEssentials: proposalResult.tiers.essentials as any,
                tierGrowth: proposalResult.tiers.growth as any,
                tierPremium: proposalResult.tiers.premium as any,
                pricing: proposalResult.pricing as any,
                assumptions: proposalResult.assumptions,
                disclaimers: proposalResult.disclaimers,
                nextSteps: proposalResult.nextSteps,
                comparisonReport: comparisonReport ? (comparisonReport as any) : undefined,
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

        const duration_ms = Date.now() - startTime;

        logger.info({
            event: 'proposal.complete',
            auditId,
            proposalId: proposal.id,
            tierPricing: proposalResult.pricing,
            duration_ms,
            cost_cents: tracker.getTotalCents()
        }, 'Proposal complete');

        const proposalUrl = `${APP_URL}/proposal/${proposal.webLinkToken}`;

        // Send notifications (fire and forget)
        sendProposalReady(auditId, audit.businessName, proposalUrl).catch(e => console.error(e));
        sendWebhook('proposal.ready', {
            auditId,
            proposalId: proposal.id,
            businessName: audit.businessName,
            url: proposalUrl
        });

        return {
            success: true,
            auditId,
            proposalId: proposal.id,
            webLinkToken: proposal.webLinkToken,
            costCents: tracker.getTotalCents()
        };

    } catch (error) {
        logError('Error generating proposal', error, { auditId });
        throw error;
    }
}
