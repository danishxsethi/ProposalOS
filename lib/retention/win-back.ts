/**
 * lib/retention/win-back.ts
 *
 * Win-back Campaign System
 *
 * Targets churned clients with a structured win-back sequence:
 * - Week 1: "We've improved" - new features showcase
 * - Week 2: "Special return offer" - 50% off first month
 * - Week 4: "Last chance" - personalized outreach
 */

import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/notifications/email';
import { prisma } from '@/lib/prisma';

export interface WinBackResult {
  campaignsCreated: number;
  emailsSent: number;
  errors: string[];
}

export interface WinBackOffer {
  code: string;
  discount: number;
  validDays: number;
  description: string;
}

/**
 * Find churned clients eligible for win-back campaign
 */
export async function findChurnedClients(daysSinceChurn: number = 30): Promise<
  {
    tenantId: string;
    tenantName: string;
    contactEmail: string;
    churnDate: Date;
    daysSinceChurn: number;
    lastPlanTier: string | null;
    totalSpent: number;
  }[]
> {
  const cutoffDate = new Date(Date.now() - daysSinceChurn * 24 * 60 * 60 * 1000);

  const churnedTenants = await prisma.tenant.findMany({
    where: {
      subscriptionStatus: { in: ['canceled', 'unpaid'] },
      status: 'suspended',
      updatedAt: { lt: cutoffDate },
    },
    include: {
      users: {
        select: { email: true, name: true },
      },
      subscriptions: {
        orderBy: { currentPeriodEnd: 'desc' },
        take: 1,
      },
      payments: {
        select: { amountCents: true },
      },
    },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });

  return churnedTenants
    .filter((t) => {
      const daysSince = Math.floor(
        (Date.now() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSince >= daysSinceChurn;
    })
    .map((t) => ({
      tenantId: t.id,
      tenantName: t.name,
      contactEmail: t.users[0]?.email || '',
      churnDate: new Date(t.updatedAt),
      daysSinceChurn: Math.floor(
        (Date.now() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
      lastPlanTier: t.planTier,
      totalSpent: t.payments.reduce((sum, p) => sum + p.amountCents, 0) / 100,
    }));
}

/**
 * Create win-back campaign for a former tenant
 */
export async function createWinBackCampaign(
  tenantId: string,
  formerTenantId: string,
  step: number,
  offerCode?: string
): Promise<string> {
  const existing = await prisma.winBackCampaign.findFirst({
    where: {
      formerTenantId,
      status: { not: 'converted' },
    },
  });

  if (existing) {
    await prisma.winBackCampaign.update({
      where: { id: existing.id },
      data: {
        step,
        lastSentAt: new Date(),
        offerCode: offerCode || existing.offerCode,
      },
    });
    return existing.id;
  }

  const campaign = await prisma.winBackCampaign.create({
    data: {
      tenantId,
      formerTenantId,
      status: 'pending',
      step,
      offerCode,
    },
  });

  return campaign.id;
}

/**
 * Generate win-back offer based on step and client value
 */
export function generateWinBackOffer(step: number, totalSpent: number): WinBackOffer {
  // Higher value clients get better offers
  const isHighValue = totalSpent > 500;

  switch (step) {
    case 1:
      return {
        code: `WELCOME25-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        discount: 25,
        validDays: 14,
        description: '25% off your first month back',
      };

    case 2:
      return {
        code: `COMEBACK50-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        discount: isHighValue ? 60 : 50,
        validDays: 7,
        description: isHighValue ? '60% off your first month' : '50% off your first month',
      };

    case 3:
      return {
        code: `LASTCHANCE-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        discount: isHighValue ? 75 : 50,
        validDays: 5,
        description: isHighValue ? '75% off - final offer' : '50% off - final offer',
      };

    default:
      return {
        code: 'WELCOME10',
        discount: 10,
        validDays: 30,
        description: '10% off your first month',
      };
  }
}

/**
 * Generate win-back email content based on step
 */
export function generateWinBackEmail(
  tenantName: string,
  step: number,
  offer: WinBackOffer,
  daysSinceChurn: number
): { subject: string; body: string } {
  switch (step) {
    case 1:
      return {
        subject: `${tenantName}, we've made some exciting improvements! 🚀`,
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>We've Improved</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">Hi ${tenantName} team! 👋</h2>
  <p style="color:#475569;margin-top:0">It's been ${daysSinceChurn} days since you last used ProposalOS. We've been busy making things better!</p>
  
  <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:20px 0">
    <h3 style="margin:0 0 8px 0;color:#0369a1;font-size:16px">🚀 What's New Since You Left</h3>
    <ul style="margin:0;color:#0369a1;font-size:14px">
      <li><strong>AI-Powered Diagnostics</strong> - 3x faster issue detection</li>
      <li><strong>Automated Fixes</strong> - One-click solutions for common problems</li>
      <li><strong>Competitor Tracking</strong> - Real-time alerts on competitor changes</li>
      <li><strong>Client Portal</strong> - Your clients can now track their progress</li>
    </ul>
  </div>
  
  <p style="color:#475569">We'd love for you to see what's changed. Come back and experience the new ProposalOS!</p>
  
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <p style="margin:0 0 8px 0;color:#166534;font-size:14px">Use code <strong style="font-size:18px">${offer.code}</strong></p>
    <p style="margin:0;color:#166534;font-size:14px">${offer.description}</p>
  </div>
  
  <a href="[RETURN_LINK]" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
    See What's New →
  </a>
  
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="[UNSUBSCRIBE_LINK]" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`,
      };

    case 2:
      return {
        subject: `${tenantName}: A special offer just for you 🎁`,
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Special Offer</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">We'd Love You Back 🎁</h2>
  <p style="color:#475569;margin-top:0">Hi ${tenantName} team,</p>
  
  <p style="color:#475569">We understand things change. But we also know that ProposalOS can make a real difference for your business.</p>
  
  <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
    <div style="font-size:32px;font-weight:bold;color:#92400e;margin-bottom:8px">${offer.discount}% OFF</div>
    <p style="margin:0;color:#92400e;font-size:14px">
      Your first month back<br>
      Use code: <strong style="font-size:18px">${offer.code}</strong>
    </p>
    <p style="color:#92400e;font-size:12px;margin-top:8px">Valid for ${offer.validDays} days</p>
  </div>
  
  <p style="color:#475569">This exclusive offer is our way of saying "we'd love a second chance."</p>
  
  <a href="[RETURN_LINK]" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
    Claim Your Discount →
  </a>
  
  <p style="color:#475569;font-size:14px;margin-top:24px">
    Questions? Hit reply - we're here to help.
  </p>
  
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="[UNSUBSCRIBE_LINK]" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`,
      };

    case 3:
      return {
        subject: `Final chance: ${offer.discount}% off, ${tenantName} ⏰`,
        body: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Final Offer</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;color:#1e293b">
  <h2 style="font-size:22px;margin-bottom:8px">⏰ Last Chance</h2>
  <p style="color:#475569;margin-top:0">Hi ${tenantName} team,</p>
  
  <p style="color:#475569">This is our final offer. We genuinely believe in the value we can provide, and we'd hate for you to miss out.</p>
  
  <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
    <div style="font-size:32px;font-weight:bold;color:#dc2626;margin-bottom:8px">${offer.discount}% OFF</div>
    <p style="margin:0;color:#991b1b;font-size:14px">
      Your first month back - FINAL OFFER<br>
      Use code: <strong style="font-size:18px">${offer.code}</strong>
    </p>
    <p style="color:#991b1b;font-size:12px;margin-top:8px">Expires in ${offer.validDays} days</p>
  </div>
  
  <p style="color:#475569;font-weight:600;margin-top:16px">Why clients come back:</p>
  <ul style="color:#475569">
    <li>Average 40% improvement in audit scores within 30 days</li>
    <li>Automated competitor monitoring saves 10+ hours/week</li>
    <li>Client retention increases by 25% with our tracking tools</li>
  </ul>
  
  <a href="[RETURN_LINK]" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px">
    Accept Final Offer →
  </a>
  
  <p style="color:#475569;font-size:14px;margin-top:24px">
    If this doesn't resonate, we completely understand. 
    <a href="[EXPORT_LINK]" style="color:#6366f1">Export your data here</a> - no hard feelings.
  </p>
  
  <p style="font-size:13px;color:#94a3b8;margin-top:32px">ProposalOS · <a href="[UNSUBSCRIBE_LINK]" style="color:#94a3b8">Unsubscribe</a></p>
</body>
</html>`,
      };

    default:
      return {
        subject: `Checking in from ProposalOS`,
        body: `<p>Hi ${tenantName} team, just checking in!</p>`,
      };
  }
}

/**
 * Run win-back campaign for all churned clients
 */
export async function runWinBackCampaign(): Promise<WinBackResult> {
  const errors: string[] = [];
  let campaignsCreated = 0;
  let emailsSent = 0;

  // Process each win-back threshold (weekly intervals)
  const thresholds = [
    { days: 30, step: 1 }, // Week 1
    { days: 37, step: 2 }, // Week 2
    { days: 51, step: 3 }, // Week 4
  ];

  for (const { days, step } of thresholds) {
    const churnedClients = await findChurnedClients(days);

    for (const client of churnedClients) {
      if (!client.contactEmail) {
        errors.push(`No email for tenant ${client.tenantId}`);
        continue;
      }

      // Check if already in a campaign
      const existingCampaign = await prisma.winBackCampaign.findFirst({
        where: {
          formerTenantId: client.tenantId,
          step,
          status: { in: ['pending', 'sent'] },
        },
      });

      if (existingCampaign) {
        continue;
      }

      try {
        // Generate offer
        const offer = generateWinBackOffer(step, client.totalSpent);

        // Create campaign
        await createWinBackCampaign(
          client.tenantId, // Current tenant (agency running the campaign)
          client.tenantId, // Former tenant being won back
          step,
          offer.code
        );

        // Generate and send email
        const email = generateWinBackEmail(client.tenantName, step, offer, client.daysSinceChurn);

        await sendEmail({
          to: client.contactEmail,
          subject: email.subject,
          body: email.body
            .replace(
              '[RETURN_LINK]',
              `https://app.proposalengine.app/winback?tenant=${client.tenantId}&code=${offer.code}`
            )
            .replace(
              '[EXPORT_LINK]',
              `https://app.proposalengine.app/export?tenant=${client.tenantId}`
            )
            .replace(
              '[UNSUBSCRIBE_LINK]',
              `https://app.proposalengine.app/unsubscribe?email=${encodeURIComponent(client.contactEmail)}`
            ),
        });

        // Update campaign status
        await prisma.winBackCampaign.updateMany({
          where: { formerTenantId: client.tenantId, step },
          data: { status: 'sent', lastSentAt: new Date() },
        });

        emailsSent++;
        campaignsCreated++;

        logger.info(
          {
            tenantId: client.tenantId,
            step,
            daysSinceChurn: client.daysSinceChurn,
            offerCode: offer.code,
          },
          'Win-back email sent'
        );
      } catch (error) {
        errors.push(`Failed to send win-back email to ${client.contactEmail}: ${error}`);
        logger.error({ error, tenantId: client.tenantId, step }, 'Win-back failed');
      }
    }
  }

  return { campaignsCreated, emailsSent, errors };
}

/**
 * Mark a win-back campaign as converted
 */
export async function markWinBackConverted(formerTenantId: string): Promise<void> {
  await prisma.winBackCampaign.updateMany({
    where: { formerTenantId },
    data: { status: 'converted', convertedAt: new Date() },
  });
}

/**
 * Reactivate a tenant after successful win-back
 */
export async function reactivateTenant(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      status: 'active',
      subscriptionStatus: 'active',
      gracePeriodEndsAt: null,
      gracePeriodNotifiedAt: null,
    },
  });

  // Mark campaign as converted
  await markWinBackConverted(tenantId);

  logger.info({ tenantId }, 'Tenant reactivated after win-back');
}
