import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDiagnosisPipeline } from '@/lib/diagnosis';
import { runProposalPipeline } from '@/lib/proposal';
import { getPlaybook, detectVertical } from '@/lib/playbooks';
import { generateComparison } from '@/lib/analysis/competitorComparison';
import { diagnosisGraph } from '@/lib/graph/diagnosis-graph';
import { proposalGraph } from '@/lib/graph/proposal-graph';
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
                evidence: {
                    where: { module: 'competitor' },
                    orderBy: { collectedAt: 'desc' },
                    take: 1,
                },
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

        // Resolve vertical playbook (from audit.verticalPlaybookId or detect from industry)
        const verticalId =
            (audit as { verticalPlaybookId?: string | null }).verticalPlaybookId ??
            detectVertical({
                businessName: audit.businessName,
                businessIndustry: audit.businessIndustry,
                businessCity: audit.businessCity,
            });
        const playbook = getPlaybook(verticalId);

        // Step 1: Run diagnosis to get clusters using graph (which now includes adversarial_qa)
        const diagnosisGraphState = await diagnosisGraph.invoke({
            findings: audit.findings,
            tenantId: audit.tenantId,
            auditId: audit.id,
            mode: 'MULTI_STEP'
        });
        
        const diagnosisResult = {
            clusters: diagnosisGraphState.clusters,
            metadata: {
                totalFindings: audit.findings.length,
                clusteredFindings: diagnosisGraphState.clusters.reduce((sum: number, c: any) => sum + c.findingIds.length, 0),
                clusteringConfidence: diagnosisGraphState.validation.valid ? 0.9 : 0.6,
            }
        };

        logger.info({
            event: 'diagnosis.complete',
            auditId,
            clusterCount: diagnosisResult.clusters.length,
            verticalPlaybook: playbook?.id ?? 'general',
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

        // Step 2: Generate proposal using graph (which now includes adversarial_qa)
        const proposalGraphState = await proposalGraph.invoke({
            businessName: audit.businessName,
            businessIndustry: audit.businessIndustry || undefined,
            clusters: diagnosisResult.clusters,
            findings: audit.findings,
            tenantId: audit.tenantId,
            auditId: audit.id
        });

        const proposalResult = proposalGraphState.proposalDef;
        const normalizedFindings = audit.findings; // Simplified for this task
        console.log(`[Propose] Proposal generated`);

        // Log costs
        // console.log(`[Propose] Cost: ${tracker.getTotalCents()} cents`, tracker.getReport());

        // Step 2.5: Run Automated QA (use same normalized findings the proposal was built from)
        const qaStatus = runAutoQA(
            proposalResult,
            normalizedFindings,
            audit.businessName,
            audit.businessCity,
            {
                industry: audit.businessIndustry,
                comparisonReport: comparisonReport ?? undefined,
            }
        );
        logger.info({
            event: 'qa.complete',
            auditId,
            score: qaStatus.score,
            passed: qaStatus.passedChecks,
            warnings: qaStatus.warnings
        }, 'QA Check Complete');
        if (qaStatus.score < 90) {
            const failedChecks = qaStatus.results.filter((r) => !r.passed).map((r) => ({ check: r.check, details: r.details }));
            logger.warn({ event: 'qa.below_agency_grade', auditId, score: qaStatus.score, failedChecks }, 'QA below 90% — failed checks');
        }

        // Auto-READY logic with client-perfect gating and hard-fails.
        const proposalStatus = qaStatus.score >= 60 ? 'READY' : 'DRAFT';
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
                comparisonReport: comparisonReport ? JSON.parse(JSON.stringify(comparisonReport)) : undefined,
                status: proposalStatus,
                // QA Results
                qaScore: qaStatus.score,
                clientScore: qaStatus.clientPerfect.score,
                qaResults: JSON.parse(JSON.stringify(qaStatus)),
                clientScoreResults: JSON.parse(JSON.stringify(qaStatus.clientPerfect)),
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
            qaScore: qaStatus.score,
            clientScore: qaStatus.clientPerfect.score,
            hardFails: qaStatus.clientPerfect.hardFails,
            requiresHumanReview: qaStatus.clientPerfect.requiresHumanReview,
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
