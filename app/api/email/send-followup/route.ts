import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';
import {
    getFollowUpTemplate,
    fillFollowUpTemplate,
} from '@/lib/email-templates/followup-sequence';
import { BRANDING } from '@/lib/config/branding';
import { logger } from '@/lib/logger';

const FROM_EMAIL = `${BRANDING.name} <onboarding@resend.dev>`;
const PHYSICAL_ADDRESS = process.env.BRAND_PHYSICAL_ADDRESS || '123 Main St, Saskatoon, SK S7N 0A1, Canada';

function getResend() {
    if (!process.env.RESEND_API_KEY) return null;
    return new Resend(process.env.RESEND_API_KEY);
}

function textToHtml(text: string): string {
    return text
        .split('\n\n')
        .map((p) => `<p style="margin: 0 0 1rem 0; font-size: 15px; line-height: 1.6;">${p.replace(/\n/g, '<br />')}</p>`)
        .join('');
}

/**
 * POST /api/email/send-followup
 * Send a follow-up email (1, 2, or 3) from the post-meeting sequence.
 * Body: { auditId, emailNumber (1|2|3), recipientEmail, recipientName? }
 */
export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) {
            return NextResponse.json({ error: 'Unauthorized: No Tenant' }, { status: 401 });
        }

        const body = await req.json();
        const auditId = body.auditId as string | undefined;
        const emailNumber = body.emailNumber as number | undefined;
        const recipientEmail = body.recipientEmail as string | undefined;
        const recipientName = (body.recipientName as string) || 'there';

        if (!auditId || !emailNumber || !recipientEmail) {
            return NextResponse.json(
                { error: 'Missing required fields: auditId, emailNumber (1|2|3), recipientEmail' },
                { status: 400 }
            );
        }

        const step = emailNumber as 1 | 2 | 3;
        if (step < 1 || step > 3) {
            return NextResponse.json(
                { error: 'emailNumber must be 1, 2, or 3' },
                { status: 400 }
            );
        }

        const template = getFollowUpTemplate(step);
        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const audit = await prisma.audit.findFirst({
            where: { id: auditId, tenantId },
            include: {
                findings: { where: { excluded: false }, orderBy: { impactScore: 'desc' }, take: 5 },
                proposals: { take: 1, orderBy: { createdAt: 'desc' } },
            },
        });

        if (!audit) {
            return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
        }

        const proposal = audit.proposals[0];
        if (!proposal) {
            return NextResponse.json({ error: 'No proposal found for this audit' }, { status: 404 });
        }

        const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const proposalUrl = `${baseUrl}/proposal/${proposal.webLinkToken}`;
        const unsubscribeUrl = `${baseUrl}/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;

        const topFinding = audit.findings[0];
        const findingText = topFinding?.title || 'several critical issues affecting your online visibility';
        const metricText = topFinding?.metrics
            ? (() => {
                  const m = topFinding.metrics as Record<string, unknown>;
                  if (typeof m.loadTimeSeconds === 'number')
                      return `Your mobile load time of ${m.loadTimeSeconds.toFixed(1)}s is costing you ~15% of visitors`;
                  if (typeof m.performanceScore === 'number')
                      return `Your performance score of ${m.performanceScore} is below the 50+ benchmark`;
                  return 'Your site is underperforming compared to local competitors';
              })()
            : 'Your site is underperforming compared to local competitors';

        const comparisonReport = proposal.comparisonReport as {
            competitors?: Array<{ name?: string }>;
        } | null;
        const competitorName =
            comparisonReport?.competitors?.[0]?.name || 'A local competitor';

        const { subject, body: emailBody } = fillFollowUpTemplate(template, {
            businessName: audit.businessName,
            proposalUrl,
            finding: findingText,
            metric: metricText,
            competitorName,
            recipientName,
            physicalAddress: PHYSICAL_ADDRESS,
            unsubscribeUrl,
        });

        const resend = getResend();
        if (!resend) {
            return NextResponse.json(
                { error: 'Email service not configured (RESEND_API_KEY missing)' },
                { status: 503 }
            );
        }

        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                ${textToHtml(emailBody)}
                <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;" />
                <p style="font-size: 11px; color: #6b7280;">
                    ${PHYSICAL_ADDRESS}<br />
                    <a href="${unsubscribeUrl}">Unsubscribe</a> from these emails.
                </p>
            </div>
        `;

        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: recipientEmail,
            subject,
            html,
        });

        if (error) {
            logger.error({ event: 'followup_email_failed', error, auditId, step }, 'Follow-up email failed');
            return NextResponse.json(
                { error: error.message || 'Failed to send email' },
                { status: 500 }
            );
        }

        await prisma.followUpEmailSend.create({
            data: {
                auditId,
                proposalId: proposal.id,
                step,
                recipientEmail,
                recipientName: recipientName !== 'there' ? recipientName : null,
                emailSubject: subject,
                emailBody,
                tenantId,
            },
        });

        logger.info(
            { event: 'followup_email_sent', auditId, step, recipientEmail, resendId: data?.id },
            'Follow-up email sent'
        );

        return NextResponse.json({ success: true, messageId: data?.id });
    } catch (err) {
        logger.error(
            { event: 'followup_email_error', error: err instanceof Error ? err.message : String(err) },
            'Send follow-up error'
        );
        return NextResponse.json(
            { error: 'Internal Server Error', message: String(err) },
            { status: 500 }
        );
    }
});
