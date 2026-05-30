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
    const normalizedFindings = audit.findings; // Simplified for this task
    logger.info({ event: 'propose.generated', auditId }, 'Proposal generated');

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
    logger.info(
      {
        event: 'qa.complete',
        auditId,
        score: qaStatus.score,
        passed: qaStatus.passedChecks,
        warnings: qaStatus.warnings,
      },
      'QA Check Complete'
    );
    if (qaStatus.score < 90) {
      const failedChecks = qaStatus.results
        .filter((r) => !r.passed)
        .map((r) => ({ check: r.check, details: r.details }));
      logger.warn(
        { event: 'qa.below_agency_grade', auditId, score: qaStatus.score, failedChecks },
        'QA below 90% — failed checks'
      );
    }

    // Auto-READY logic with client-perfect gating and hard-fails.
    const proposalStatus = determineProposalStatus(qaStatus);
    logger.info(
      {
        event: 'proposal.status.decided',
        auditId,
        qaScore: qaStatus.score,
        passedChecks: qaStatus.passedChecks,
        totalChecks: qaStatus.totalChecks,
        needsReview: qaStatus.needsReview,
        status: proposalStatus,
      },
      'Proposal status decided'
    );

    // Step 3: Save proposal to database (serialize to JSON)
    const proposal = await prisma.proposal.create({
      data: {
        auditId,
        tenantId: audit.tenantId, // Fixed TS error
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
        comparisonReport: comparisonReport
          ? JSON.parse(JSON.stringify(comparisonReport))
          : undefined,
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

    logger.info(
      {
        event: 'propose.saved',
        auditId,
        proposalId: proposal.id,
        qaScore: qaStatus.score,
        status: proposalStatus,
      },
      'Proposal saved'
    );

    const duration_ms = Date.now() - startTime;

    logger.info(
      {
        event: 'proposal.complete',
        auditId,
        proposalId: proposal.id,
        tierPricing: proposalResult.pricing,
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
      status: proposalStatus,
      qaScore: qaStatus.score,
      clientScore: qaStatus.clientPerfect.score,
      hardFails: qaStatus.clientPerfect.hardFails,
      requiresHumanReview: qaStatus.clientPerfect.requiresHumanReview,
      proposal: proposalResult,
      costCents: tracker.getTotalCents(),
      duration_ms,
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
