/**
 * app/api/cron/follow-ups/route.ts
 *
 * Follow-ups Cron Job
 * Processes pending proposal follow-ups and sends emails
 *
 * Features:
 * - Cron auth verification
 * - Rate limiting
 * - Standardized error responses
 */

import { NextResponse } from 'next/server';

import { Resend } from 'resend';

import { generateTraceId, InternalError } from '@/lib/api/errors';
import { withSystemDbBypass } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import {
  claimOutboundSend,
  completeOutboundSend,
  markOutboundSendUnknown,
  releaseOutboundSend,
} from '@/lib/outreach/outboundSafety';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/**
 * Inner handler for follow-ups cron
 */
async function handleFollowUpsCron(req: Request): Promise<NextResponse> {
  const traceId = generateTraceId();

  try {
    const now = new Date();

    // 1. Fetch pending follow-ups due now or in past
    const dueFollowUps = await withSystemDbBypass('cron:follow-ups:list-due', (client) =>
      client.proposalFollowUp.findMany({
        where: {
          status: 'pending',
          scheduledAt: { lte: now },
        },
        select: { id: true, tenantId: true },
        take: 50,
        orderBy: { scheduledAt: 'asc' },
      })
    );

    const results = [];

    for (const item of dueFollowUps) {
      try {
        const outcome = await runWithTenantAsync(item.tenantId, async () => {
          const followUp = await prisma.proposalFollowUp.findFirst({
            where: {
              id: item.id,
              tenantId: item.tenantId,
              status: 'pending',
              scheduledAt: { lte: now },
            },
            include: {
              proposal: { include: { audit: true } },
            },
          });
          if (!followUp) return { id: item.id, status: 'skipped', reason: 'not_due_or_claimed' };

          const proposal = followUp.proposal;
          if (
            proposal.status === 'ACCEPTED' ||
            proposal.status === 'REJECTED' ||
            proposal.replyReceivedAt ||
            proposal.meetingBookedAt
          ) {
            await prisma.proposalFollowUp.update({
              where: { id: followUp.id },
              data: { status: 'cancelled' },
            });
            return { id: followUp.id, status: 'cancelled', reason: 'terminal_proposal_state' };
          }

          const tenant = await prisma.tenant.findUnique({
            where: { id: item.tenantId },
            include: { brandingConfig: true, users: { take: 1 } },
          });
          if (!tenant) return { id: followUp.id, status: 'failed', reason: 'tenant_not_found' };

          const toEmail =
            followUp.type === 'reminder'
              ? tenant.brandingConfig?.contactEmail || tenant.users[0]?.email || ''
              : proposal.prospectEmail || '';
          if (!toEmail) {
            await prisma.proposalFollowUp.update({
              where: { id: followUp.id },
              data: { status: 'failed_no_email' },
            });
            return { id: followUp.id, status: 'failed', reason: 'no_email' };
          }

          const suppressed = await prisma.emailBlocklist.findUnique({
            where: { email: toEmail },
            select: { id: true },
          });
          if (suppressed) {
            await prisma.proposalFollowUp.update({
              where: { id: followUp.id },
              data: { status: 'cancelled' },
            });
            return { id: followUp.id, status: 'cancelled', reason: 'recipient_suppressed' };
          }

          const config = await prisma.pipelineConfig.findUnique({
            where: { tenantId: item.tenantId },
            select: { dailyVolumeLimit: true },
          });
          const alreadySent = await prisma.proposalFollowUp.count({
            where: {
              tenantId: item.tenantId,
              status: 'sent',
              sentAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
            },
          });
          const idempotencyKey = `followup:${followUp.proposalId}:${followUp.step}`;
          const claim = await claimOutboundSend({
            tenantId: item.tenantId,
            idempotencyKey,
            dailyCap: config?.dailyVolumeLimit || 200,
            capScope: 'followup',
            alreadySent,
            now,
          });
          if (claim.status !== 'claimed') {
            return {
              id: followUp.id,
              status: claim.status === 'unavailable' ? 'skipped' : claim.status,
              reason: claim.status === 'unavailable' ? claim.reason : claim.status,
            };
          }

          await prisma.proposalFollowUp.update({
            where: { id: followUp.id },
            data: { status: 'sending' },
          });

          const resend = getResend();
          if (!resend) {
            await releaseOutboundSend({
              tenantId: item.tenantId,
              idempotencyKey,
              dailyCap: config?.dailyVolumeLimit || 200,
              capScope: 'followup',
              now,
            });
            await prisma.proposalFollowUp.update({
              where: { id: followUp.id },
              data: { status: 'pending' },
            });
            return { id: followUp.id, status: 'skipped', reason: 'provider_unavailable' };
          }

          try {
            const { data, error } = await resend.emails.send({
              from: `${tenant.brandingConfig?.brandName || proposal.audit.businessName} <onboarding@resend.dev>`,
              to: toEmail,
              subject: followUp.emailSubject,
              text: followUp.emailBody,
            });
            if (error || !data?.id) {
              await releaseOutboundSend({
                tenantId: item.tenantId,
                idempotencyKey,
                dailyCap: config?.dailyVolumeLimit || 200,
                capScope: 'followup',
                now,
              });
              await prisma.proposalFollowUp.update({
                where: { id: followUp.id },
                data: { status: 'failed' },
              });
              return {
                id: followUp.id,
                status: 'failed',
                reason: error?.message || 'provider_rejected',
              };
            }

            await prisma.pipelineErrorLog.create({
              data: {
                tenantId: item.tenantId,
                stage: 'outreach',
                errorType: 'FOLLOW_UP_SENT',
                errorMessage: 'Provider accepted follow-up delivery',
                metadata: { followUpId: followUp.id, idempotencyKey, providerMessageId: data.id },
              },
            });
            await prisma.proposalFollowUp.update({
              where: { id: followUp.id },
              data: { status: 'sent', sentAt: new Date() },
            });
            await completeOutboundSend({
              tenantId: item.tenantId,
              idempotencyKey,
              dailyCap: config?.dailyVolumeLimit || 200,
              capScope: 'followup',
              now,
            });
            return { id: followUp.id, status: 'sent' };
          } catch (error) {
            await markOutboundSendUnknown(
              {
                tenantId: item.tenantId,
                idempotencyKey,
                dailyCap: config?.dailyVolumeLimit || 200,
                capScope: 'followup',
                now,
              },
              error instanceof Error ? error.message : 'provider outcome unknown'
            );
            await prisma.proposalFollowUp.update({
              where: { id: followUp.id },
              data: { status: 'unknown' },
            });
            return { id: followUp.id, status: 'unknown', reason: 'provider_outcome_unknown' };
          }
        });
        results.push(outcome);
      } catch (err) {
        logger.error(`Failed to process follow-up ${item.id}`, err);
        await runWithTenantAsync(item.tenantId, () =>
          prisma.proposalFollowUp.update({
            where: { id: item.id },
            data: { status: 'failed' },
          })
        );
      }
    }

    const response = NextResponse.json({ success: true, processed: results.length, results });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    logger.error('Cron Error:', error);
    const internalError = new InternalError('Follow-ups cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = await verifyCronAuth(req);
  if (authError) return authError;
  return handleFollowUpsCron(req);
};

// Apply rate limiting (5 requests per minute for cron jobs)
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: 'Too many cron requests. Please wait before trying again.',
  })(req, () => authHandler(req));

export const GET = rateLimitedHandler;
