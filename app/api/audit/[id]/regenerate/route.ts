import { NextResponse } from 'next/server';

import { CostTracker } from '@/lib/costs/costTracker';
import { invokeDiagnosisGraphWithTimeout } from '@/lib/graph/diagnosis-graph';
import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { runProposalPipeline } from '@/lib/proposal';
import { ProposalQAService } from '@/lib/proposal/ProposalQAService';
import { determineProposalStatus } from '@/lib/proposal/status';
import { runAutoQA } from '@/lib/qa/autoQA';
import { getTenantId } from '@/lib/tenant/context';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/audit/[id]/regenerate
 * Regenerate proposal with edited findings
 */
async function handleRegeneration(request: Request, { params }: Params): Promise<NextResponse> {
  try {
    const { id: auditId } = await params;
    const tenantId = await getTenantId();

    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Daily Quota / Cost Budget
    const { checkDailyAuditLimit } = await import('@/lib/costs/costTracker');
    const dailyLimit = checkDailyAuditLimit(tenantId);
    if (!dailyLimit.allowed) {
      const { recordAuditTrailEvent } = await import('@/lib/observability/auditTrail');
      await recordAuditTrailEvent({
        eventType: 'abuse.quota_exceeded',
        tenantId,
        payload: {
          routeClass: 'proposal_generation',
          limit: dailyLimit.limit,
          todayCount: dailyLimit.todayCount,
          remaining: dailyLimit.remaining,
          auditId,
        },
      }).catch(() => {});

      return NextResponse.json(
        {
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Daily Audit Limit Exceeded',
            details: { reason: 'DAILY_CAP_REACHED', upgrade: true },
            timestamp: new Date().toISOString(),
          },
        },
        { status: 429 }
      );
    }

    // Verify audit exists
    const audit = await prisma.audit.findFirst({
      where: { id: auditId, tenantId },
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

    logger.info(
      { event: 'regenerate.start', auditId, version: nextVersion },
      'Starting regeneration'
    );

    const evidenceSnapshots = await prisma.evidenceSnapshot.findMany({
      where: {
        auditId,
        tenantId: audit.tenantId,
      },
    });

    // Re-run diagnosis with current (possibly edited) findings via LangGraph (P0-3)
    const diagnosisResult = await invokeDiagnosisGraphWithTimeout({
      findings: audit.findings,
      evidenceSnapshots,
      tenantId: audit.tenantId,
      auditId: audit.id,
      mode: 'MULTI_STEP',
    });
    logger.info(
      {
        event: 'regenerate.diagnosis_complete',
        auditId,
        clusterCount: diagnosisResult.clusters?.length ?? 0,
      },
      'Diagnosis complete'
    );

    // Re-run proposal generation
    const proposalResult = await runProposalPipeline(
      audit.businessName,
      audit.businessIndustry || 'general',
      diagnosisResult.clusters,
      audit.findings,
      tracker,
      undefined,
      null,
      null,
      audit.businessCity,
      audit.businessUrl
    );
    logger.info({ event: 'regenerate.generated', auditId }, 'Proposal generated');

    // Log costs
    logger.info(
      { event: 'regenerate.cost', auditId, costCents: tracker.getTotalCents() },
      'Regeneration cost'
    );

    // Save new proposal version via ProposalQAService
    const evaluation = ProposalQAService.evaluateProposal(
      proposalResult,
      audit.findings,
      audit.businessName,
      audit.businessCity,
      {
        industry: audit.businessIndustry,
      }
    );
    const proposalStatus = evaluation.passed ? 'READY' : 'DRAFT';

    const proposal = await prisma.proposal.create({
      data: {
        auditId,
        tenantId: audit.tenantId,
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
        status: proposalStatus,
        qaScore: evaluation.autoQAStatus.score,
        clientScore: evaluation.autoQAStatus.clientPerfect.score,
        qaResults: JSON.parse(
          JSON.stringify({
            ...evaluation.autoQAStatus,
            evaluation: {
              dimensions: evaluation.dimensions,
              overallScore: evaluation.overallScore,
              feedbackLogs: evaluation.feedbackLogs,
              passed: evaluation.passed,
              metadataStatus: evaluation.passed ? 'ready' : 'in_review',
            },
          })
        ),
        clientScoreResults: JSON.parse(JSON.stringify(evaluation.autoQAStatus.clientPerfect)),
      },
    });

    // Update audit cost
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        apiCostCents: { increment: tracker.getTotalCents() },
      },
    });

    await recordAuditTrailEvent({
      eventType: 'proposal.generated',
      tenantId: audit.tenantId,
      auditId,
      proposalId: proposal.id,
      payload: {
        version: nextVersion,
        status: proposalStatus,
        qaScore: evaluation.autoQAStatus.score,
        costCents: tracker.getTotalCents(),
        isRegeneration: true,
        overallScore: evaluation.overallScore,
        dimensions: evaluation.dimensions,
        feedbackLogs: evaluation.feedbackLogs,
        passed: evaluation.passed,
      },
    }).catch(() => {});

    logger.info(
      { event: 'regenerate.saved', auditId, proposalId: proposal.id, version: nextVersion },
      'New proposal saved'
    );

    return NextResponse.json({
      id: proposal.id,
      version: proposal.version,
      webLinkToken: proposal.webLinkToken,
      status: proposalStatus,
      qaScore: evaluation.autoQAStatus.score,
      executiveSummary: proposal.executiveSummary?.slice(0, 200) + '...',
      pricing: proposal.pricing,
      regenerationsRemaining: 3 - nextVersion,
      costCents: tracker.getTotalCents(),
      evaluation: {
        dimensions: evaluation.dimensions,
        overallScore: evaluation.overallScore,
        passed: evaluation.passed,
        feedbackLogs: evaluation.feedbackLogs,
      },
    });
  } catch (error) {
    logger.error('[Regenerate] Error:', error);
    return NextResponse.json({ error: 'Failed to regenerate proposal' }, { status: 500 });
  }
}

const rateLimitedHandler = (req: Request, ...args: any[]) =>
  withRateLimit({
    routeClass: 'proposal_generation',
    windowMs: 60 * 1000,
    max: 5,
    failClosed: true,
    auditOnBlock: false,
    message: 'Too many proposal requests. Please wait before trying again.',
  })(req, () => handleRegeneration(req, args[0] as Params));

const idempotentHandler = (req: Request, ...args: any[]) =>
  withIdempotency(rateLimitedHandler)(req, ...args);

export const POST = withAuth(idempotentHandler);
