/**
 * Grace Period Service for Subscription Payment Failures
 * 
 * When Stripe payment fails, tenants enter a grace period instead of
 * immediate suspension. This allows for payment retry and prevents
 * service disruption for temporary payment issues.
 * 
 * Features:
 * - 7-day grace period for failed payments
 * - Automatic notifications
 * - Grace period tracking
 * - Service access during grace period
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/outreach/emailSender';

export interface GracePeriodConfig {
  gracePeriodDays: number;
  notificationDays: number[]; // Days to send reminders (e.g., [1, 3, 6])
}

const DEFAULT_CONFIG: GracePeriodConfig = {
  gracePeriodDays: 7,
  notificationDays: [1, 3, 6], // Notify on day 1, 3, and 6
};

/**
 * Start grace period for a tenant
 */
export async function startGracePeriod(
  tenantId: string,
  reason: 'payment_failed' | 'subscription_canceled' | 'manual'
): Promise<void> {
  const gracePeriodEndsAt = new Date();
  gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + DEFAULT_CONFIG.gracePeriodDays);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      gracePeriodEndsAt,
      gracePeriodNotifiedAt: null, // Reset notification tracking
    },
  });

  logger.info(
    {
      event: 'grace_period.started',
      tenantId,
      reason,
      gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
    },
    `Grace period started for tenant ${tenantId}`
  );

  // Send initial notification
  await sendGracePeriodNotification(tenantId, 'initial');
}

/**
 * Check if tenant is in grace period
 */
export async function isInGracePeriod(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { gracePeriodEndsAt: true, status: true },
  });

  if (!tenant?.gracePeriodEndsAt) {
    return false;
  }

  // Grace period expired
  if (new Date() > tenant.gracePeriodEndsAt) {
    return false;
  }

  return true;
}

/**
 * Check if tenant has service access (including during grace period)
 */
export async function hasServiceAccess(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, gracePeriodEndsAt: true },
  });

  if (!tenant) {
    return false;
  }

  // Active tenants always have access
  if (tenant.status === 'active') {
    return true;
  }

  // Check grace period
  if (tenant.gracePeriodEndsAt && new Date() < tenant.gracePeriodEndsAt) {
    return true; // Access during grace period
  }

  return false;
}

/**
 * Send grace period notification
 */
export async function sendGracePeriodNotification(
  tenantId: string,
  type: 'initial' | 'reminder' | 'final' | 'expired'
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        where: { role: 'owner' },
        select: { email: true, name: true },
      },
    },
  });

  if (!tenant || tenant.users.length === 0) {
    logger.warn({ tenantId }, 'No owner user found for grace period notification');
    return;
  }

  const ownerEmail = tenant.users[0]?.email;
  const ownerName = tenant.users[0]?.name || tenant.name;

  const subjectMap = {
    initial: `Payment Issue - Action Required for ${tenant.name}`,
    reminder: `Reminder: Payment Issue for ${tenant.name}`,
    final: `Final Notice: Subscription Expiring Soon`,
    expired: `Subscription Expired - ${tenant.name}`,
  };

  const daysRemaining = tenant.gracePeriodEndsAt
    ? Math.ceil((new Date(tenant.gracePeriodEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const bodyHtml = getNotificationBody(type, tenant.name, daysRemaining);

  try {
    await sendEmail({
      to: ownerEmail || ownerEmail,
      subject: subjectMap[type],
      body: bodyHtml,
      fromName: 'ProposalOS Billing',
    });

    logger.info(
      {
        event: 'grace_period.notification_sent',
        tenantId,
        type,
        recipient: ownerEmail,
      },
      `Grace period notification sent to ${ownerEmail}`
    );
  } catch (error: any) {
    logger.error(
      {
        event: 'grace_period.notification_failed',
        tenantId,
        type,
        error: error.message,
      },
      'Failed to send grace period notification'
    );
  }
}

/**
 * Get notification body HTML
 */
function getNotificationBody(
  type: 'initial' | 'reminder' | 'final' | 'expired',
  tenantName: string,
  daysRemaining: number
): string {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://app.proposal-os.com';

  if (type === 'initial') {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Issue Detected</h2>
        <p>Hi ${tenantName},</p>
        <p>We were unable to process your subscription payment. This may be due to:</p>
        <ul>
          <li>Expired card</li>
          <li>Insufficient funds</li>
          <li>Bank decline</li>
        </ul>
        <p><strong>Don't worry - your service will continue uninterrupted for ${daysRemaining} days.</strong></p>
        <p>Please update your payment method to avoid any disruption:</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/settings/billing" 
             style="background-color: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method
          </a>
        </p>
        <p>If you have any questions, please contact support.</p>
        <p>Best regards,<br/>The ProposalOS Team</p>
      </div>
    `;
  }

  if (type === 'reminder') {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Reminder</h2>
        <p>Hi ${tenantName},</p>
        <p>This is a friendly reminder that we were unable to process your subscription payment.</p>
        <p><strong>You have ${daysRemaining} days remaining</strong> before your subscription is suspended.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/settings/billing" 
             style="background-color: #F59E0B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method
          </a>
        </p>
        <p>Best regards,<br/>The ProposalOS Team</p>
      </div>
    `;
  }

  if (type === 'final') {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #DC2626;">Final Notice</h2>
        <p>Hi ${tenantName},</p>
        <p><strong>Your subscription will expire in ${daysRemaining} day(s).</strong></p>
        <p>Please update your payment method immediately to avoid service disruption.</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/settings/billing" 
             style="background-color: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method Now
          </a>
        </p>
        <p>After expiration, you will lose access to premium features.</p>
        <p>Best regards,<br/>The ProposalOS Team</p>
      </div>
    `;
  }

  // Expired
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #DC2626;">Subscription Expired</h2>
      <p>Hi ${tenantName},</p>
      <p>Your subscription has expired due to non-payment.</p>
      <p>You can reactivate your subscription at any time by updating your payment method:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${baseUrl}/settings/billing" 
           style="background-color: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Reactivate Subscription
        </a>
      </p>
      <p>Best regards,<br/>The ProposalOS Team</p>
    </div>
  `;
}

/**
 * End grace period (either by payment or expiration)
 */
export async function endGracePeriod(
  tenantId: string,
  reason: 'payment_received' | 'expired'
): Promise<void> {
  if (reason === 'payment_received') {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        gracePeriodEndsAt: null,
        gracePeriodNotifiedAt: null,
        status: 'active',
        subscriptionStatus: 'active',
      },
    });

    logger.info(
      {
        event: 'grace_period.ended',
        tenantId,
        reason,
      },
      `Grace period ended for tenant ${tenantId} - payment received`
    );
  } else {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        gracePeriodEndsAt: null,
        gracePeriodNotifiedAt: null,
        status: 'suspended',
        subscriptionStatus: 'canceled',
      },
    });

    logger.info(
      {
        event: 'grace_period.ended',
        tenantId,
        reason,
      },
      `Grace period ended for tenant ${tenantId} - expired`
    );

    await sendGracePeriodNotification(tenantId, 'expired');
  }
}

/**
 * Process grace period reminders (called by cron)
 */
export async function processGracePeriodReminders(): Promise<{
  processed: number;
  notificationsSent: number;
  expired: number;
}> {
  const now = new Date();

  // Get all tenants in grace period
  const tenants = await prisma.tenant.findMany({
    where: {
      gracePeriodEndsAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Started within last 7 days
      },
      status: {
        not: 'active', // Only process non-active tenants
      },
    },
  });

  let processed = 0;
  let notificationsSent = 0;
  let expired = 0;

  for (const tenant of tenants) {
    processed++;

    const daysInGracePeriod = Math.floor(
      (now.getTime() - (tenant.gracePeriodNotifiedAt?.getTime() || now.getTime())) / (1000 * 60 * 60 * 24)
    );

    const daysRemaining = Math.ceil(
      (tenant.gracePeriodEndsAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if expired
    if (daysRemaining < 0) {
      await endGracePeriod(tenant.id, 'expired');
      expired++;
      continue;
    }

    // Check if we should send a reminder
    if (DEFAULT_CONFIG.notificationDays.includes(daysInGracePeriod + 1)) {
      const notificationType =
        daysRemaining <= 1 ? 'final' : daysInGracePeriod === 0 ? 'initial' : 'reminder';

      await sendGracePeriodNotification(tenant.id, notificationType);
      notificationsSent++;

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          gracePeriodNotifiedAt: now,
        },
      });
    }
  }

  return { processed, notificationsSent, expired };
}