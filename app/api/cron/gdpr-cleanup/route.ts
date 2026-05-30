/**
 * app/api/cron/gdpr-cleanup/route.ts
 *
 * GDPR Cleanup Cron Job
 * Anonymizes stale leads for GDPR compliance
 *
 * Features:
 * - Per-tenant retention based on plan tier
 * - Free/Starter: 30 days, Pro: 90 days, Agency/Enterprise: 365 days
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Get retention days based on tenant's plan tier
 * - Free/Starter: 30 days
 * - Pro: 90 days
 * - Agency/Enterprise: 365 days (effectively unlimited)
 */
function getRetentionDaysForTier(planTier: string): number {
  const tier = planTier.toLowerCase();
  if (tier === 'free' || tier === 'starter') return 30;
  if (tier === 'pro') return 90;
  if (['agency', 'enterprise'].includes(tier)) return 365;
  return 90; // default
}

/**
 * Inner handler for GDPR cleanup cron
 */
async function handleGdprCleanup(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    // Get all tenants with their plan tiers
    const tenants = await prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, planTier: true },
    });

    let totalAnonymized = 0;

    // Process each tenant with their specific retention settings
    for (const tenant of tenants) {
      const retentionDays = getRetentionDaysForTier(tenant.planTier);
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - retentionDays);

      // Find leads that are either DROPPED or DISQUALIFIED and older than retention threshold
      const staleLeads = await prisma.prospectLead.findMany({
        where: {
          tenantId: tenant.id,
          status: {
            in: ['DISQUALIFIED'],
          },
          updatedAt: { lte: thresholdDate },
          anonymizedAt: null,
        },
        select: { id: true, decisionMakerEmail: true },
      });

      const staleDroppedLeads = await prisma.prospectLead.findMany({
        where: {
          tenantId: tenant.id,
          outreachStage: 'DROPPED',
          outreachDroppedAt: { lte: thresholdDate },
          anonymizedAt: null,
        },
        select: { id: true, decisionMakerEmail: true },
      });

      const eligibleLeads = [...staleLeads, ...staleDroppedLeads];

      if (eligibleLeads.length === 0) continue;

      const eligibleLeadIds = eligibleLeads.map((l) => l.id);
      const emailsToAnonymize = eligibleLeads
        .map((l) => l.decisionMakerEmail)
        .filter(Boolean) as string[];

      // Anonymize the PII to comply with GDPR / Data Retention policies
      await prisma.prospectLead.updateMany({
        where: {
          id: { in: eligibleLeadIds },
        },
        data: {
          businessName: 'ANONYMIZED_BUSINESS',
          decisionMakerName: 'Anonymized',
          decisionMakerEmail: 'anonymized@gdpr.local',
          decisionMakerLinkedin: null,
          phone: null,
          website: null,
          enrichmentState: {},
          qualificationEvidence: {},
          anonymizedAt: new Date(),
        },
      });

      // Cascade anonymization to orphaned proposal PII
      if (emailsToAnonymize.length > 0) {
        await prisma.proposal.updateMany({
          where: { prospectEmail: { in: emailsToAnonymize } },
          data: { prospectEmail: 'anonymized@gdpr.local' },
        });

        await prisma.proposalOutreach.updateMany({
          where: { recipientEmail: { in: emailsToAnonymize } },
          data: { recipientEmail: 'anonymized@gdpr.local' },
        });

        await prisma.followUpEmailSend.updateMany({
          where: { recipientEmail: { in: emailsToAnonymize } },
          data: { recipientEmail: 'anonymized@gdpr.local', recipientName: 'Anonymized' },
        });

        await prisma.contactRequest.updateMany({
          where: { email: { in: emailsToAnonymize } },
          data: { email: 'anonymized@gdpr.local', name: 'Anonymized' },
        });
      }

      // Also anonymize any outreach emails sent to them
      await prisma.outreachEmail.updateMany({
        where: {
          leadId: { in: eligibleLeadIds },
        },
        data: {
          body: '[REDACTED FOR GDPR COMPLIANCE]',
          subject: '[REDACTED FOR GDPR COMPLIANCE]',
        },
      });

      totalAnonymized += eligibleLeads.length;

      logger.info(
        {
          event: 'cron.gdpr_cleanup',
          tenantId: tenant.id,
          planTier: tenant.planTier,
          retentionDays,
          anonymizedCount: eligibleLeads.length,
        },
        `Anonymized ${eligibleLeads.length} stale leads for tenant ${tenant.id} (plan: ${tenant.planTier}, retention: ${retentionDays} days)`
      );
    }

    logger.info(
      {
        event: 'cron.gdpr_cleanup',
        totalAnonymized,
        tenantsProcessed: tenants.length,
      },
      `GDPR cleanup completed: ${totalAnonymized} leads anonymized across ${tenants.length} tenants`
    );

    const response = NextResponse.json({
      success: true,
      anonymizedCount: totalAnonymized,
      tenantsProcessed: tenants.length,
    });

    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error({ error }, 'Failed to run GDPR cleanup cron');
    const internalError = new InternalError('GDPR cleanup cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleGdprCleanup(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
