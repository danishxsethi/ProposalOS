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
import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

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
    const dueFollowUps = await prisma.proposalFollowUp.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: now },
      },
      include: {
        proposal: {
          include: { audit: true },
        },
      },
      take: 50, // Batch size to prevent timeouts
    });

    const results = [];

    for (const item of dueFollowUps) {
      try {
        // Fetch Tenant to get sender info
        const tenant = await prisma.tenant.findUnique({
          where: { id: item.tenantId },
          include: { brandingConfig: true, users: { take: 1 } },
        });

        if (!tenant) continue;

        const senderName = tenant.brandingConfig?.brandName || item.proposal.audit.businessName;
        const senderEmail = 'onboarding@resend.dev'; // Default sandbox

        let toEmail = '';

        if (item.type === 'reminder') {
          // Send to Operator (first user or contact email)
          toEmail = tenant.brandingConfig?.contactEmail || tenant.users[0]?.email || '';
        } else {
          // Send to Prospect (from proposal.prospectEmail if available)
          toEmail = (item.proposal as any).prospectEmail;
        }

        if (toEmail) {
          const resend = getResend();
          if (resend) {
            await resend.emails.send({
              from: `${senderName} <${senderEmail}>`,
              to: toEmail,
              subject: item.emailSubject,
              text: item.emailBody,
            });
          }
          await prisma.proposalFollowUp.update({
            where: { id: item.id },
            data: resend ? { status: 'sent', sentAt: new Date() } : { status: 'failed_no_resend' },
          });
          results.push({ id: item.id, status: resend ? 'sent' : 'skipped', to: toEmail });
        } else {
          // Missing email, mark as failed
          await prisma.proposalFollowUp.update({
            where: { id: item.id },
            data: { status: 'failed_no_email' },
          });
          results.push({ id: item.id, status: 'failed', reason: 'no email' });
        }
      } catch (err) {
        console.error(`Failed to process follow-up ${item.id}`, err);
        await prisma.proposalFollowUp.update({
          where: { id: item.id },
          data: { status: 'failed' },
        });
      }
    }

    const response = NextResponse.json({ success: true, processed: results.length, results });
    response.headers.set('X-Trace-Id', traceId);
    return response;
  } catch (error) {
    console.error('Cron Error:', error);
    const internalError = new InternalError('Follow-ups cron failed', {
      originalError: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(internalError.toEnvelope(req.url, traceId), { status: 500 });
  }
}

// Auth wrapper
const authHandler = async (req: Request): Promise<NextResponse> => {
  const authError = verifyCronAuth(req);
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
