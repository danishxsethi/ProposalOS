import { NextResponse } from 'next/server';

import { checkDailyAuditLimit, CostTracker } from '@/lib/costs/costTracker';
import { logError, logger } from '@/lib/logger';
import { withAuth } from '@/lib/middleware/auth';
import { withIdempotency } from '@/lib/middleware/idempotency';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { compileAndPersistProposal, getCurrentProposalVersion } from '@/lib/proposal/compiler';
import { getTenantId } from '@/lib/tenant/context';
import { createParentTrace } from '@/lib/tracing';

interface Params {
  params: Promise<{ id: string }>;
}

async function handleProposal(req: Request, { params }: Params): Promise<NextResponse> {
  let auditId: string | undefined;
  try {
    auditId = (await params).id;
    const startTime = Date.now();
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    const audit = await prisma.audit.findFirst({
      where: { id: auditId, tenantId },
      include: {
        findings: true,
        proposals: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    if (audit.status !== 'COMPLETE' || audit.trustState !== 'TRUSTED') {
      return NextResponse.json(
        { error: 'Audit requires review before proposal generation', trustState: audit.trustState },
        { status: 409 }
      );
    }
    if (audit.proposals[0] && audit.proposals[0].status !== 'REJECTED') {
      const existing = audit.proposals[0];
      return NextResponse.json({
        success: true,
        auditId,
        proposalId: existing.id,
        webLinkToken: existing.webLinkToken,
        status: existing.status,
        qaScore: existing.qaScore,
        clientScore: existing.clientScore,
        proposal: null,
        idempotentReuse: true,
      });
    }

    const body = await req.json().catch(() => ({}));
    let templateId = body.templateId;
    if (!templateId) {
      const defaultTemplate = await prisma.proposalTemplate.findFirst({
        where: { tenantId: audit.tenantId, isDefault: true },
      });
      templateId = defaultTemplate?.id;
    }

    let prospectEmail: string | null = null;
    if (audit.businessUrl) {
      try {
        const { findEmails } = await import('@/lib/modules/emailFinder');
        const result = await findEmails(audit.businessUrl);
        if (result.emails.length > 0) prospectEmail = result.emails[0] ?? null;
      } catch (error) {
        logger.warn({ event: 'email_finder.error', auditId, err: error }, 'Email finder failed');
      }
    }

    try {
      await createParentTrace(auditId, 'proposal-generation', {
        businessName: audit.businessName,
        industry: audit.businessIndustry,
        findingsCount: audit.findings.length,
      });
    } catch (error) {
      logger.warn({ event: 'tracing.create_parent_trace.error', auditId, err: error }, 'Failed to create parent trace');
    }

    const result = await compileAndPersistProposal({
      auditId,
      tenantId,
      version: await getCurrentProposalVersion(auditId, tenantId),
      templateId,
      prospectEmail,
      costTracker: new CostTracker(),
    });
    return NextResponse.json({
      success: true,
      auditId,
      proposalId: result.proposalRecord.id,
      webLinkToken: result.proposalRecord.webLinkToken,
      status: result.proposalRecord.status,
      qaScore: result.evaluation.autoQAStatus.score,
      clientScore: result.evaluation.autoQAStatus.clientPerfect.score,
      hardFails: result.evaluation.autoQAStatus.clientPerfect.hardFails,
      requiresHumanReview: result.evaluation.autoQAStatus.clientPerfect.requiresHumanReview,
      proposal: result.proposal,
      costCents: result.costTracker.getTotalCents(),
      duration_ms: Date.now() - startTime,
      evaluation: {
        dimensions: result.evaluation.dimensions,
        overallScore: result.evaluation.overallScore,
        passed: result.evaluation.passed,
        feedbackLogs: result.evaluation.feedbackLogs,
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
