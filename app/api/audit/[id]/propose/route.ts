import { NextResponse } from 'next/server';

import { generateComparison } from '@/lib/analysis/competitorComparison';
import { CostTracker } from '@/lib/costs/costTracker';
import { invokeDiagnosisGraphWithTimeout } from '@/lib/graph/diagnosis-graph';
import { invokeProposalGraphWithTimeout } from '@/lib/graph/proposal-graph';
import { logError, logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { detectVertical, getPlaybook } from '@/lib/playbooks';
import { prisma } from '@/lib/prisma';
import { ProposalQAService } from '@/lib/proposal/ProposalQAService';
import { determineProposalStatus } from '@/lib/proposal/status';
import { runAutoQA } from '@/lib/qa/autoQA';
import { getTenantId } from '@/lib/tenant/context';
import { createParentTrace } from '@/lib/tracing';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/audit/[id]/propose
 * Generate a proposal for an audit
 */
async function handleProposal(req: Request, { params }: Params): Promise<NextResponse> {
  let auditId: string | undefined;
  try {
    const resolved = await params;
    auditId = resolved.id;
    const startTime = Date.now();
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

    logger.info(
      {
        event: 'proposal.start',
        auditId,
      },
      'Starting proposal generation'
    );

    // Fetch audit with findings
    const audit = await prisma.audit.findFirst({
      where: { id: auditId, tenantId },
      include: {
        findings: true,
        proposals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        evidence: {
          where: { module: 'competitor' },
          orderBy: { collectedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.findings.length === 0) {
      return NextResponse.json({ error: 'No findings to generate proposal from' }, { status: 400 });
    }

    const existingProposal = audit.proposals[0];
    if (existingProposal && existingProposal.status !== 'REJECTED') {
      logger.info(
        {
          event: 'proposal.idempotent_reuse',
          auditId,
          proposalId: existingProposal.id,
          status: existingProposal.status,
        },
        'Skipping duplicate proposal generation and reusing existing proposal'
      );

      return NextResponse.json({
        success: true,
        auditId,
        proposalId: existingProposal.id,
        webLinkToken: existingProposal.webLinkToken,
        status: existingProposal.status,
        qaScore: existingProposal.qaScore,
        clientScore: existingProposal.clientScore,
        proposal: null,
        idempotentReuse: true,
      });
    }

    // Determine Template
    const body = await req.json().catch(() => ({}));
    let templateId = body.templateId;

    if (!templateId) {
      const defaultTemplate = await prisma.proposalTemplate.findFirst({
        where: {
          tenantId: audit.tenantId,
          isDefault: true,
        },
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
        logger.warn({ event: 'email_finder.error', auditId, err: e }, 'Email finder failed');
      }
    }

    const tracker = new CostTracker();

    logger.info({ event: 'propose.generating', auditId }, 'Generating proposal');

    // Create parent trace for this proposal generation flow
    try {
      await createParentTrace(auditId, 'proposal-generation', {
        businessName: audit.businessName,
        industry: audit.businessIndustry,
        findingsCount: audit.findings.length,
      });
    } catch (e) {
      logger.warn(
        { event: 'tracing.create_parent_trace.error', auditId, err: e },
        'Failed to create parent trace'
      );
    }

    // Resolve vertical playbook (from audit.verticalPlaybookId or detect from industry)
    const verticalId =
      (audit as { verticalPlaybookId?: string | null }).verticalPlaybookId ??
      detectVertical({
        businessName: audit.businessName,
        businessIndustry: audit.businessIndustry,
        businessCity: audit.businessCity,
      });
    const playbook = getPlaybook(verticalId);

    // Fetch full evidence snapshots for P1-4
    const evidenceSnapshots = await prisma.evidenceSnapshot.findMany({
      where: { auditId },
    });

    // Step 1: Run diagnosis to get clusters via canonical timeout wrapper
    const initialState = {
      findings: audit.findings,
      evidenceSnapshots,
      tenantId: audit.tenantId,
      auditId: audit.id,
      mode: 'MULTI_STEP' as const,
      costTracker: tracker,
    };

    const diagnosisGraphState = await invokeDiagnosisGraphWithTimeout(initialState);

    const diagnosisResult = {
      clusters: diagnosisGraphState.clusters,
      metadata: {
        totalFindings: audit.findings.length,
        clusteredFindings: diagnosisGraphState.clusters.reduce(
          (sum: number, c: any) => sum + c.findingIds.length,
          0
        ),
        clusteringConfidence: diagnosisGraphState.validation?.valid ? 0.9 : 0.6,
      },
    };

    logger.info(
      {
        event: 'diagnosis.complete',
        auditId,
        clusterCount: diagnosisResult.clusters.length,
        verticalPlaybook: playbook?.id ?? 'general',
        duration_ms: Date.now() - startTime,
      },
      'Diagnosis complete'
    );

    // Build comparison report from competitor evidence
    let comparisonReport = null;
    const competitorEvidence = audit.evidence?.[0]?.rawResponse as
      | { comparisonMatrix?: { business?: unknown; competitors?: unknown[] } }
      | undefined;
    if (
      competitorEvidence?.comparisonMatrix?.business &&
      competitorEvidence.comparisonMatrix.competitors?.length
    ) {
      const { business, competitors } = competitorEvidence.comparisonMatrix;
      comparisonReport = generateComparison(
        business as Parameters<typeof generateComparison>[0],
        competitors as Parameters<typeof generateComparison>[1],
        audit.businessIndustry || undefined
      );
    }

    let version = 1;
    let proposal = null;
    let evaluationResult = null;
    let finalProposal = null;

    while (version <= 3) {
      // Step 2: Generate proposal via canonical timeout wrapper
      const proposalGraphState = await invokeProposalGraphWithTimeout({
        businessName: audit.businessName,
        businessIndustry: audit.businessIndustry || undefined,
        clusters: diagnosisResult.clusters,
        findings: audit.findings,
        tenantId: audit.tenantId,
        auditId: audit.id,
      });

      const proposalResult = proposalGraphState.proposalDef;
      const normalizedFindings = audit.findings;

      // Use complete proposal if available, otherwise fall back to old format
      finalProposal = proposalGraphState.completeProposal || proposalResult;

      // Step 2.5: Run Automated QA evaluation via ProposalQAService
      const evaluation = ProposalQAService.evaluateProposal(
        finalProposal,
        audit.findings,
        audit.businessName,
        audit.businessCity,
        {
          industry: audit.businessIndustry,
          comparisonReport: comparisonReport ?? undefined,
        }
      );

      const proposalStatus = evaluation.passed ? 'READY' : 'DRAFT';

      logger.info(
        {
          event: 'proposal.status.decided',
          auditId,
          version,
          overallScore: evaluation.overallScore,
          passedChecks: evaluation.autoQAStatus.passedChecks,
          totalChecks: evaluation.autoQAStatus.totalChecks,
          status: proposalStatus,
        },
        'Proposal status decided'
      );

      // Step 3: Save proposal to database (serialize to JSON)
      proposal = await prisma.proposal.create({
        data: {
          auditId,
          tenantId: audit.tenantId,
          version,
          templateId,
          prospectEmail,
          executiveSummary: finalProposal.executiveSummary,
          painClusters: JSON.parse(JSON.stringify(diagnosisResult.clusters)),
          tierEssentials: JSON.parse(JSON.stringify(finalProposal.tiers.essentials)),
          tierGrowth: JSON.parse(JSON.stringify(finalProposal.tiers.growth)),
          tierPremium: JSON.parse(JSON.stringify(finalProposal.tiers.premium)),
          pricing: JSON.parse(JSON.stringify(finalProposal.pricing)),
          assumptions: finalProposal.assumptions,
          disclaimers: finalProposal.disclaimers,
          nextSteps: finalProposal.nextSteps,
          comparisonReport: comparisonReport
            ? JSON.parse(JSON.stringify(comparisonReport))
            : undefined,
          status: proposalStatus,
          // QA Results
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

      evaluationResult = evaluation;

      if (evaluation.passed) {
        logger.info(
          {
            event: 'proposal.promotion.passed',
            auditId,
            version,
            overallScore: evaluation.overallScore,
          },
          'Proposal passed QA and is promoted to READY'
        );
        break;
      } else {
        logger.warn(
          {
            event: 'proposal.promotion.failed',
            auditId,
            version,
            overallScore: evaluation.overallScore,
            feedbackLogs: evaluation.feedbackLogs,
          },
          'Proposal failed QA auto-promotion'
        );
        if (version < 3) {
          version++;
        } else {
          logger.info({ auditId }, 'Max automated QA regenerations reached.');
          break;
        }
      }
    }

    if (!proposal || !evaluationResult || !finalProposal) {
      throw new Error('Failed to generate any proposal version');
    }

    // Update audit cost
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        apiCostCents: { increment: tracker.getTotalCents() },
      },
    });

    logger.info(
      {
        event: 'propose.saved',
        auditId,
        proposalId: proposal.id,
        qaScore: evaluationResult.autoQAStatus.score,
        status: proposal.status,
      },
      'Proposal saved'
    );

    const duration_ms = Date.now() - startTime;

    logger.info(
      {
        event: 'proposal.complete',
        auditId,
        proposalId: proposal.id,
        tierPricing: finalProposal.pricing,
        duration_ms,
        cost_cents: tracker.getTotalCents(),
      },
      'Proposal complete'
    );

    return NextResponse.json({
      success: true,
      auditId,
      proposalId: proposal.id,
      webLinkToken: proposal.webLinkToken,
      status: proposal.status,
      qaScore: evaluationResult.autoQAStatus.score,
      clientScore: evaluationResult.autoQAStatus.clientPerfect.score,
      hardFails: evaluationResult.autoQAStatus.clientPerfect.hardFails,
      requiresHumanReview: evaluationResult.autoQAStatus.clientPerfect.requiresHumanReview,
      proposal: finalProposal,
      costCents: tracker.getTotalCents(),
      duration_ms,
      evaluation: {
        dimensions: evaluationResult.dimensions,
        overallScore: evaluationResult.overallScore,
        passed: evaluationResult.passed,
        feedbackLogs: evaluationResult.feedbackLogs,
      },
    });
  } catch (error) {
    logError('Error generating proposal', error, { auditId: auditId ?? 'unknown' });
    return NextResponse.json(
      { error: 'Internal Server Error', details: String(error) },
      { status: 500 }
    );
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
  })(req, () => handleProposal(req, args[0] as Params));

const idempotentHandler = (req: Request, ...args: any[]) =>
  withIdempotency(rateLimitedHandler)(req, ...args);

export const POST = withAuth(idempotentHandler);
