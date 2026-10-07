import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';
import { compileAndPersistProposal, getCurrentProposalVersion } from '@/lib/proposal/compiler';
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

    if (audit.status !== 'COMPLETE' || audit.trustState !== 'TRUSTED') {
      return NextResponse.json(
        { error: 'Audit requires review before proposal generation', trustState: audit.trustState },
        { status: 409 }
      );
    }

    if (audit.findings.length === 0) {
      return NextResponse.json(
        { error: 'No findings available for proposal generation' },
        { status: 400 }
      );
    }

    // Get next version number
    const currentVersion = audit.proposals[0]?.version || 0;
    const nextVersion = Math.max(currentVersion + 1, await getCurrentProposalVersion(auditId, tenantId));

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

    logger.info(
      { event: 'regenerate.start', auditId, version: nextVersion },
      'Starting regeneration'
    );

    const result = await compileAndPersistProposal({ auditId, tenantId, version: nextVersion });
    const { proposalRecord: proposal, evaluation } = result;
    const proposalStatus = proposal.status;
    const costCents = result.costTracker.getTotalCents();
    logger.info({ event: 'regenerate.generated', auditId }, 'Proposal generated');
    logger.info({ event: 'regenerate.cost', auditId, costCents }, 'Regeneration cost');

    await recordAuditTrailEvent({
      eventType: 'proposal.generated',
      tenantId: audit.tenantId,
      auditId,
      proposalId: proposal.id,
      payload: {
        version: nextVersion,
        status: proposalStatus,
        qaScore: evaluation.autoQAStatus.score,
        costCents,
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
      costCents,
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
