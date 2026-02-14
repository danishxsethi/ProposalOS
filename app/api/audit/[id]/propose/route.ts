import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDiagnosisPipeline } from '@/lib/diagnosis';
import { runProposalPipeline } from '@/lib/proposal';
import { CostTracker } from '@/lib/costs/costTracker';
import { logger, logError } from '@/lib/logger';
import { Metrics } from '@/lib/metrics';
import { createParentTrace } from '@/lib/tracing';
import { RunTree } from 'langsmith';
import { runAutoQA } from '@/lib/qa/autoQA';

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
    { params }: { params: Promise<{ id: string }> }
) => {
    let auditId: string | undefined;
    try {
        const resolved = await params;
        auditId = resolved.id;
        const startTime = Date.now();

        // Start parent trace
        let parentTrace: RunTree | undefined;
        try {
            // We need to fetch audit first to get metadata call valid
            // Move trace creation after audit fetch or use placeholder for now
        } catch (e) {
            // ignore
        }

        logger.info({
            event: 'proposal.start',
            auditId
        }, 'Starting proposal generation');



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

        // Determine Template
        const body = await req.json().catch(() => ({}));
        let templateId = body.templateId;

        if (!templateId) {
            const defaultTemplate = await prisma.proposalTemplate.findFirst({
                where: {
                    tenantId: audit.tenantId,
                    isDefault: true
                }
            });
            if (defaultTemplate) templateId = defaultTemplate.id;
        }

        // Feature: Email Finder
        let prospectEmail = null;
        if (audit.businessUrl) {
            try {
                // We import dynamically to avoid top-level issues if any
                const { findEmails } = await import('@/lib/modules/emailFinder');
                const result = await findEmails(audit.businessUrl);
                if (result.emails.length > 0) {
                    prospectEmail = result.emails[0];
                }
            } catch (e) {
                console.error('Email finder error', e);
            }
        }

        const tracker = new CostTracker();

        console.log(`[Propose] Generating proposal for audit ${auditId}...`);



        // Create parent trace for this proposal generation flow
        try {
            parentTrace = await createParentTrace(auditId, "proposal-generation", {
                businessName: audit.businessName,
                industry: audit.businessIndustry,
                findingsCount: audit.findings.length
            });
        } catch (e) {
            console.error("Failed to create parent trace", e);
        }

        // We need to pass this parent trace down to the pipelines
        // But the pipelines (runDiagnosisPipeline, runProposalPipeline) don't accept it yet.
        // We need to update them OR we use a clearer pattern:
        // We will monkey-patch or use AsyncLocalStorage if we were fancy, but here manual passing is best.
        // BUT, user asked to just wrap calls. 
        // 
        // Wait, the user said: "When POST /api/audit is called, create a parent run".
        // But here I am in `propose`. User said "Create a parent trace per audit".
        // And "When POST /api/audit is called... all child LLM calls are nested".
        // BUT, `audit` endpoint calls modules. `propose` endpoint calls diagnosis/proposal.
        // There are two distinct operations separated by time.
        // I should probably have TWO parent traces? One for "Audit Data Collection" and one for "Proposal Generation"?
        // Or link them?
        // Given the instructions "When POST /api/audit is called" -> that implies the audit phase.
        // But the LLM calls I instrumented (clustering, executive summary) are in the PROPOSAL phase (this file).
        // 
        // So I should create a parent trace HERE for "Proposal Generation".
        // And I should ALSO go to `audit/route.ts` and create one for "Audit" (reputation module).
        // 
        // To properly nest, I need to pass `parentTrace` to the functions. 
        // `runDiagnosisPipeline` and `runProposalPipeline` need to accept an optional `parentTrace`.
        // 
        // Let's modify `runDiagnosisPipeline` and `runProposalPipeline` signatures in next steps.
        // For now, I'll just initialize it here.

        // Step 1: Run diagnosis to get clusters
        // TODO: Pass parentTrace
        const diagnosisResult = await runDiagnosisPipeline(audit.findings, tracker, parentTrace);

        logger.info({
            event: 'diagnosis.complete',
            auditId,
            clusterCount: diagnosisResult.clusters.length,
            duration_ms: Date.now() - startTime
        }, 'Diagnosis complete');

        // Step 2: Generate proposal
        const proposalResult = await runProposalPipeline(
            audit.businessName,
            audit.businessIndustry || undefined,
            diagnosisResult.clusters,
            audit.findings,
            tracker,
            parentTrace
        );
        console.log(`[Propose] Proposal generated`);

        // Log costs
        // console.log(`[Propose] Cost: ${tracker.getTotalCents()} cents`, tracker.getReport());

        // Step 2.5: Run Automated QA
        const qaStatus = runAutoQA(proposalResult, audit.findings, audit.businessName, audit.businessCity);
        logger.info({
            event: 'qa.complete',
            auditId,
            score: qaStatus.score,
            passed: qaStatus.passedChecks,
            warnings: qaStatus.warnings
        }, 'QA Check Complete');

        // Auto-READY: high QA score (>=60%) and no needsReview → READY; else DRAFT
        const proposalStatus = (qaStatus.score >= 60 && !qaStatus.needsReview) ? 'READY' : 'DRAFT';
        logger.info({
            event: 'proposal.status.decided',
            auditId,
            qaScore: qaStatus.score,
            passedChecks: qaStatus.passedChecks,
            totalChecks: qaStatus.totalChecks,
            needsReview: qaStatus.needsReview,
            status: proposalStatus
        }, 'Proposal status decided');

        // Step 3: Save proposal to database (serialize to JSON)
        const proposal = await prisma.proposal.create({
            data: {
                auditId,
                templateId,
                prospectEmail,
                executiveSummary: proposalResult.executiveSummary,
                painClusters: JSON.parse(JSON.stringify(diagnosisResult.clusters)),
                tierEssentials: JSON.parse(JSON.stringify(proposalResult.tiers.essentials)),
                tierGrowth: JSON.parse(JSON.stringify(proposalResult.tiers.growth)),
                tierPremium: JSON.parse(JSON.stringify(proposalResult.tiers.premium)),
                pricing: JSON.parse(JSON.stringify(proposalResult.pricing)),
                assumptions: proposalResult.assumptions,
                disclaimers: proposalResult.disclaimers,
                nextSteps: proposalResult.nextSteps,
                status: proposalStatus,
                // QA Results
                qaScore: qaStatus.score,
                qaResults: JSON.parse(JSON.stringify(qaStatus))
            },
        });

        // Update audit cost
        await prisma.audit.update({
            where: { id: auditId },
            data: {
                apiCostCents: { increment: tracker.getTotalCents() },
            },
        });

        console.log(`[Propose] Proposal saved: ${proposal.id} (QA Score: ${qaStatus.score}%, status: ${proposalStatus})`);

        const duration_ms = Date.now() - startTime;

        logger.info({
            event: 'proposal.complete',
            auditId,
            proposalId: proposal.id,
            tierPricing: proposalResult.pricing,
            duration_ms,
            cost_cents: tracker.getTotalCents()
        }, 'Proposal complete');

        return NextResponse.json({
            success: true,
            auditId,
            proposalId: proposal.id,
            webLinkToken: proposal.webLinkToken,
            status: proposalStatus,
            proposal: proposalResult,
            costCents: tracker.getTotalCents(),
            duration_ms
        });

    } catch (error) {
        logError('Error generating proposal', error, { auditId: auditId ?? 'unknown' });
        return NextResponse.json(
            { error: 'Internal Server Error', details: String(error) },
            { status: 500 }
        );
    }
});
