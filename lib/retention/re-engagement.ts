/**
 * lib/retention/re-engagement.ts
 *
 * Re-engagement Campaign System
 *
 * Detects inactive clients and automatically sends re-engagement emails:
 * - Day 30: "We miss you" + free mini-audit offer
 * - Day 45: "Competitor alert" + new feature highlight
 * - Day 60: Final "special offer" discount
 */

import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/notifications/email';
import { prisma } from '@/lib/prisma';

export interface ReEngagementResult {
  campaignsCreated: number;
  emailsSent: number;
  errors: string[];
}

/**
 * Find clients who haven't engaged in 30+ days
 */
export async function findInactiveClients(daysInactive: number = 30): Promise<
  {
    proposalId: string;
    tenantId: string;
    businessName: string;
    prospectEmail: string | null;
    lastEngagement: Date;
    daysSinceEngagement: number;
  }[]
> {
  const cutoffDate = new Date(Date.now() - daysInactive * 24 * 60 * 60 * 1000);

  const inactiveProposals = await prisma.proposal.findMany({
    where: {
      status: 'ACCEPTED',
      createdAt: { lt: cutoffDate },
      audit: {
        status: 'COMPLETE',
      },
    },
    include: {
      audit: {
        select: {
          businessName: true,
          tenantId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  return inactiveProposals
    .filter((p) => {
      const daysSince = Math.floor(
        (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSince >= daysInactive;
    })
    .map((p) => ({
      proposalId: p.id,
      tenantId: p.audit.tenantId,
      businessName: p.audit.businessName,
      prospectEmail: p.prospectEmail,
      lastEngagement: new Date(p.createdAt),
      daysSinceEngagement: Math.floor(
        (Date.now() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
    }));
}

/**
 * Create or update re-engagement campaign for a proposal
 */
export async function createReEngagementCampaign(
  proposalId: string,
  tenantId: string,
  step: number
): Promise<string> {
  const existing = await prisma.reEngagementCampaign.findFirst({
    where: { proposalId, status: { not: 'converted' } },
  });

  if (existing) {
    await prisma.reEngagementCampaign.update({
      where: { id: existing.id },
      data: { step, lastSentAt: new Date() },
    });
    return existing.id;
  }

  const campaign = await prisma.reEngagementCampaign.create({
    data: {
      tenantId,
      proposalId,
      status: 'pending',
      step,
    },
  });

  return campaign.id;
}

/**
 * Generate re-engagement email content based on step
 */
export function generateReEngagementEmail(
  businessName: string,
  step: number,
  daysInactive: number
): { subject: string; body: string } {
  switch (step) {
    case 1:
      return {
        subject: `We miss you at ${businessName}! Here's a free mini-audit 🎁`,
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>We Miss You</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">Hi ${businessName} team! 👋</h2>
  <p style="color:#475569;margin-top:0">It's been ${daysInactive} days since we last connected. We'd love to check in and see how things are going.</p>
  
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0">
    <h3 style="margin:0 0 8px 0;color:#166534;font-size:16px">🎁 Special Offer: Free Mini-Audit</h3>
    <p style="margin:0;color:#166534;font-size:14px">
      As a valued client, we'd like to offer you a complimentary mini-audit to identify any new opportunities for improvement.
    </p>
  </div>
  
  <p style="color:#475569">The digital landscape changes fast. Let us help you stay ahead with:</p>
  <ul style="color:#475569">
    <li>Updated performance benchmarks</li>
    <li>New competitor analysis</li>
    <li>Fresh recommendations based on latest data</li>
  </ul>
  
  <a href="[SCAN_LINK]" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
    Run Your Free Mini-Audit →
  </a>
  
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="[UNSUBSCRIBE_LINK]" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`,
      };

    case 2:
      return {
        subject: `${businessName}: Your competitors are improving (here's how to keep up) 📊`,
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Competitor Alert</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">📊 Competitive Intelligence Alert</h2>
  <p style="color:#475569;margin-top:0">Hi ${businessName} team,</p>
  
  <p style="color:#475569">We've been monitoring your industry and noticed increased activity from competitors. Here's what's happening:</p>
  
  <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0">
    <h3 style="margin:0 0 8px 0;color:#92400e;font-size:16px">🔍 Industry Trends We're Seeing</h3>
    <ul style="margin:0;color:#92400e;font-size:14px">
      <li>Average site speeds improving by 25%</li>
      <li>Mobile UX becoming a key ranking factor</li>
      <li>Accessibility compliance now mandatory in many regions</li>
    </ul>
  </div>
  
  <p style="color:#475569">Don't fall behind. Our latest features help you:</p>
  <ul style="color:#475569">
    <li>Track competitor changes in real-time</li>
    <li>Get AI-powered improvement suggestions</li>
    <li>Auto-fix common issues with one click</li>
  </ul>
  
  <a href="[FEATURES_LINK]" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
    See What's New →
  </a>
  
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="[UNSUBSCRIBE_LINK]" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`,
      };

    case 3:
      return {
        subject: `Last chance: 50% off your next upgrade, ${businessName} 🎯`,
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Special Offer</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">🎯 One Last Offer</h2>
  <p style="color:#475569;margin-top:0">Hi ${businessName} team,</p>
  
  <p style="color:#475569">We haven't heard from you in a while, and we'd hate to see you miss out.</p>
  
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
    <div style="font-size:32px;font-weight:bold;color:#dc2626;margin-bottom:8px">50% OFF</div>
    <p style="margin:0;color:#991b1b;font-size:14px">
      Your next upgrade or add-on service<br>
      Use code: <strong style="font-size:18px">COMEBACK50</strong>
    </p>
    <p style="color:#991b1b;font-size:12px;margin-top:8px">Valid for 7 days</p>
  </div>
  
  <p style="color:#475569">This is our best offer to help you get back on track with continuous improvement.</p>
  
  <a href="[UPGRADE_LINK]" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
    Claim Your Discount →
  </a>
  
  <p style="color:#475569;font-size:14px;margin-top:24px">
    If you've already moved in a different direction, we completely understand. 
    <a href="[OFFBOARD_LINK]" style="color:#6366f1">Click here to export your data</a> and part as friends.
  </p>
  
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="[UNSUBSCRIBE_LINK]" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`,
      };

    default:
      return {
        subject: `Checking in from ProposalOS`,
        body: `<p>Hi ${businessName} team, just checking in!</p>`,
      };
  }
}

/**
 * Run re-engagement campaign for all inactive clients
 */
export async function runReEngagementCampaign(): Promise<ReEngagementResult> {
  const errors: string[] = [];
  let campaignsCreated = 0;
  let emailsSent = 0;

  // Process each inactivity threshold
  const thresholds = [
    { days: 30, step: 1 },
    { days: 45, step: 2 },
    { days: 60, step: 3 },
  ];

  for (const { days, step } of thresholds) {
    const inactiveClients = await findInactiveClients(days);

    for (const client of inactiveClients) {
      if (!client.prospectEmail) {
        errors.push(`No email for proposal ${client.proposalId}`);
        continue;
      }

      // Check if already in a campaign
      const existingCampaign = await prisma.reEngagementCampaign.findFirst({
        where: {
          proposalId: client.proposalId,
          step,
          status: { in: ['pending', 'sent'] },
        },
      });

      if (existingCampaign) {
        continue; // Already processing this step
      }

      try {
        // Create campaign
        await createReEngagementCampaign(client.proposalId, client.tenantId, step);

        // Generate and send email
        const email = generateReEngagementEmail(client.businessName, step, days);

        await sendEmail({
          to: client.prospectEmail,
          subject: email.subject,
          body: email.body
            .replace(
              '[SCAN_LINK]',
              `https://app.proposalengine.app/client/scan?proposal=${client.proposalId}`
            )
            .replace('[FEATURES_LINK]', 'https://proposalengine.app/features')
            .replace(
              '[UPGRADE_LINK]',
              `https://app.proposalengine.app/pricing?proposal=${client.proposalId}`
            )
            .replace(
              '[OFFBOARD_LINK]',
              `https://app.proposalengine.app/client/export?proposal=${client.proposalId}`
            )
            .replace(
              '[UNSUBSCRIBE_LINK]',
              `https://app.proposalengine.app/unsubscribe?email=${encodeURIComponent(client.prospectEmail)}`
            ),
        });

        // Update campaign status
        await prisma.reEngagementCampaign.updateMany({
          where: { proposalId: client.proposalId, step },
          data: { status: 'sent', lastSentAt: new Date() },
        });

        emailsSent++;
        campaignsCreated++;

        logger.info(
          {
            proposalId: client.proposalId,
            step,
            daysInactive: days,
          },
          'Re-engagement email sent'
        );
      } catch (error) {
        errors.push(`Failed to send re-engagement email to ${client.prospectEmail}: ${error}`);
        logger.error({ error, proposalId: client.proposalId, step }, 'Re-engagement failed');
      }
    }
  }

  return { campaignsCreated, emailsSent, errors };
}

/**
 * Mark a re-engagement campaign as converted
 */
export async function markCampaignConverted(proposalId: string): Promise<void> {
  await prisma.reEngagementCampaign.updateMany({
    where: { proposalId },
    data: { status: 'converted', convertedAt: new Date() },
  });
}
