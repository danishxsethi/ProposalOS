/**
 * FIX-04: Onboarding email dispatch.
 * Sent immediately after a proposal is purchased.
 */

import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

const TIER_LABELS: Record<string, string> = {
    essentials: 'Essentials Package',
    growth: 'Growth Package',
    premium: 'Premium Package',
};

const TIER_TIMELINES: Record<string, string> = {
    essentials: '5–7 business days',
    growth: '10–14 business days',
    premium: '14–21 business days',
};

const TIER_NEXT_STEPS: Record<string, string[]> = {
    essentials: [
        'Our team will begin with a priority review of your top 3 critical fixes.',
        'You\'ll receive an update email within 48 hours with work-in-progress details.',
        'All fixes will be packaged and delivered to you as a ready-to-deploy bundle.',
    ],
    growth: [
        'A dedicated strategist will be assigned to your account within 24 hours.',
        'We\'ll schedule a kickoff call to walk through the full Growth plan.',
        'Weekly progress updates will be sent every Monday.',
        'All fixes are deployed with before/after performance reports.',
    ],
    premium: [
        'Your Senior Strategist will reach out within 4 business hours.',
        'Full discovery call to align on timeline, milestones, and priorities.',
        'Daily Slack channel access for real-time updates.',
        'Executive dashboard with live KPI tracking throughout delivery.',
    ],
};

export interface OnboardingEmailOptions {
    proposalId: string;
    clientEmail: string;
    clientName?: string;
    tier: string;
    tenantId: string;
}

/**
 * Sends the welcome/onboarding email to a new client after purchase.
 */
export async function sendOnboardingEmail(opts: OnboardingEmailOptions): Promise<void> {
    const { proposalId, clientEmail, clientName, tier, tenantId } = opts;

    const tierLabel = TIER_LABELS[tier] ?? tier;
    const timeline = TIER_TIMELINES[tier] ?? '10–14 business days';
    const nextSteps = TIER_NEXT_STEPS[tier] ?? TIER_NEXT_STEPS.essentials;

    // Fetch branding for the tenant
    let brandName = 'ProposalOS';
    let replyTo = process.env.DEFAULT_REPLY_TO ?? 'support@proposalos.com';
    let fromEmail = process.env.DEFAULT_FROM_EMAIL ?? 'noreply@proposalos.com';

    try {
        const branding = await prisma.tenantBranding.findUnique({
            where: { tenantId },
            select: { brandName: true, contactEmail: true },
        });
        if (branding?.brandName) brandName = branding.brandName;
        if (branding?.contactEmail) {
            replyTo = branding.contactEmail;
            fromEmail = branding.contactEmail;
        }
    } catch {
        // Use defaults if branding fetch fails
    }

    const greeting = clientName ? `Hi ${clientName},` : 'Hi there,';
    const clientDashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/client/proposal/${proposalId}`;

    const nextStepsHtml = nextSteps
        .map((step, i) => `<li style="margin-bottom:8px;">${i + 1}. ${step}</li>`)
        .join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <div style="border-bottom:3px solid #8B5CF6;padding-bottom:16px;margin-bottom:24px;">
    <h1 style="margin:0;font-size:22px;color:#8B5CF6;">${brandName}</h1>
  </div>

  <p style="font-size:16px;">${greeting}</p>

  <p style="font-size:16px;">
    🎉 <strong>Welcome aboard!</strong> Your <strong>${tierLabel}</strong> is confirmed and our team is getting to work.
  </p>

  <div style="background:#f5f3ff;border-left:4px solid #8B5CF6;padding:16px;border-radius:4px;margin:20px 0;">
    <p style="margin:0;font-weight:600;">Estimated delivery: <span style="color:#8B5CF6;">${timeline}</span></p>
  </div>

  <h3 style="font-size:16px;margin-top:24px;">What happens next:</h3>
  <ul style="padding-left:16px;line-height:1.8;">
    ${nextStepsHtml}
  </ul>

  <div style="margin:28px 0;">
    <a href="${clientDashboardUrl}"
       style="background:#8B5CF6;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
      View Your Live Fix Tracker →
    </a>
  </div>

  <p style="font-size:14px;color:#555;">
    Questions? Just reply to this email and we'll get back to you within one business day.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="font-size:12px;color:#999;">
    ${brandName} · Powered by ProposalOS
  </p>
</body>
</html>`;

    try {
        const result = await resend.emails.send({
            from: `${brandName} <${fromEmail}>`,
            to: clientEmail,
            replyTo,
            subject: `🎉 You're in! Your ${tierLabel} is confirmed`,
            html,
        });

        logger.info(
            { proposalId, clientEmail, tier, messageId: result.data?.id },
            'Onboarding email sent successfully'
        );
    } catch (err) {
        logger.error({ proposalId, clientEmail, err }, 'Failed to send onboarding email');
        throw err;
    }
}
