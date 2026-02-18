/**
 * Inbox Rotation Manager — Distributes outreach emails across sending domains
 * 
 * Implements smart domain rotation to:
 * - Distribute emails across tenant's OutreachSendingDomains
 * - Respect daily limits (default: 50 emails/domain/day)
 * - Select domain with lowest usage for the day
 * - Handle reply detection to pause follow-up sequences
 * 
 * Requirements: 4.6, 4.9
 */

import { prisma } from '@/lib/prisma';
import type { GeneratedEmail, SendResult } from './types';
import { pauseFollowUpSequence } from './outreach';

// ============================================================================
// Domain Selection
// ============================================================================

/**
 * Selects the best sending domain for a tenant on the current day.
 * 
 * Strategy:
 * 1. Query all active domains for the tenant
 * 2. Get today's usage stats for each domain
 * 3. Filter out domains at or above their daily limit
 * 4. Select the domain with the lowest usage
 * 
 * Requirements: 4.6
 */
export async function selectSendingDomain(tenantId: string): Promise<string | null> {
  // Get all active sending domains for the tenant
  const domains = await prisma.outreachSendingDomain.findMany({
    where: {
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      domain: true,
      fromEmail: true,
      dailyLimit: true,
    },
  });

  if (domains.length === 0) {
    return null;
  }

  // Get today's date at midnight UTC for consistent daily stats
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Get today's usage for all domains
  const stats = await prisma.outreachDomainDailyStat.findMany({
    where: {
      tenantId,
      domainId: { in: domains.map((d) => d.id) },
      day: today,
    },
    select: {
      domainId: true,
      sentCount: true,
    },
  });

  // Build a map of domain ID to sent count
  const usageMap = new Map<string, number>();
  for (const stat of stats) {
    usageMap.set(stat.domainId, stat.sentCount);
  }

  // Filter domains that haven't reached their limit and find the one with lowest usage
  let bestDomain: { id: string; usage: number } | null = null;

  for (const domain of domains) {
    const usage = usageMap.get(domain.id) || 0;
    
    // Skip if at or above limit
    if (usage >= domain.dailyLimit) {
      continue;
    }

    // Select if this is the first valid domain or has lower usage
    if (bestDomain === null || usage < bestDomain.usage) {
      bestDomain = { id: domain.id, usage };
    }
  }

  return bestDomain?.id || null;
}

// ============================================================================
// Daily Stats Management
// ============================================================================

/**
 * Increments the sent count for a domain on the current day.
 * Creates the daily stat record if it doesn't exist.
 */
async function incrementDomainSentCount(tenantId: string, domainId: string): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Use upsert to create or update the daily stat
  await prisma.outreachDomainDailyStat.upsert({
    where: {
      domainId_day: {
        domainId,
        day: today,
      },
    },
    create: {
      tenantId,
      domainId,
      day: today,
      sentCount: 1,
      openCount: 0,
      clickCount: 0,
      replyCount: 0,
    },
    update: {
      sentCount: { increment: 1 },
    },
  });
}

/**
 * Gets the current sent count for a domain on the current day.
 */
export async function getDomainSentCount(domainId: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const stat = await prisma.outreachDomainDailyStat.findUnique({
    where: {
      domainId_day: {
        domainId,
        day: today,
      },
    },
    select: {
      sentCount: true,
    },
  });

  return stat?.sentCount || 0;
}

// ============================================================================
// Email Sending with Rotation
// ============================================================================

/**
 * Sends an email using domain rotation.
 * 
 * Process:
 * 1. Select the best available domain (lowest usage, under limit)
 * 2. If no domain available, return 'queued' status
 * 3. Create OutreachEmail record with selected domain
 * 4. Increment domain's daily sent count
 * 5. Return send result
 * 
 * Requirements: 4.6
 */
export async function sendWithRotation(
  email: GeneratedEmail,
  tenantId: string
): Promise<SendResult> {
  // Select the best sending domain
  const domainId = await selectSendingDomain(tenantId);

  if (!domainId) {
    // No available domain (all at limit or none configured)
    return {
      emailId: email.id,
      status: 'queued',
      sendingDomain: 'none',
      error: 'No available sending domain (all at daily limit or none configured)',
    };
  }

  // Get domain details
  const domain = await prisma.outreachSendingDomain.findUnique({
    where: { id: domainId },
    select: {
      domain: true,
      fromEmail: true,
      fromName: true,
    },
  });

  if (!domain) {
    return {
      emailId: email.id,
      status: 'failed',
      sendingDomain: 'none',
      error: 'Selected domain not found',
    };
  }

  try {
    // Create the outreach email record
    const outreachEmail = await prisma.outreachEmail.create({
      data: {
        tenantId,
        leadId: email.prospectId,
        domainId,
        type: 'INITIAL',
        status: 'SENT',
        subject: email.subject,
        body: email.body,
        qualityScore: 100, // Passed QA gate
        scorecardUrl: email.scorecardUrl,
        sentAt: new Date(),
      },
    });

    // Increment the domain's daily sent count
    await incrementDomainSentCount(tenantId, domainId);

    return {
      emailId: outreachEmail.id,
      status: 'sent',
      sendingDomain: domain.fromEmail,
      sentAt: new Date(),
    };
  } catch (error) {
    return {
      emailId: email.id,
      status: 'failed',
      sendingDomain: domain.fromEmail,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Reply Detection
// ============================================================================

/**
 * Processes a reply event and pauses the follow-up sequence.
 * 
 * When a prospect replies to an outreach email:
 * 1. Record the reply event
 * 2. Pause all pending follow-ups for that lead
 * 3. Update the domain's reply count for the day
 * 
 * Requirements: 4.9
 */
export async function handleReply(
  tenantId: string,
  leadId: string,
  emailId: string
): Promise<void> {
  // Get the email to find the domain
  const email = await prisma.outreachEmail.findUnique({
    where: { id: emailId },
    select: {
      domainId: true,
      sentAt: true,
    },
  });

  if (!email || !email.domainId) {
    throw new Error(`Email not found or has no domain: ${emailId}`);
  }

  // Pause the follow-up sequence
  await pauseFollowUpSequence(leadId);

  // Record the reply event
  await prisma.outreachEmailEvent.create({
    data: {
      tenantId,
      leadId,
      type: 'REPLY_RECEIVED',
      metadata: {
        emailId,
        pausedFollowUps: true,
      },
    },
  });

  // Update the domain's reply count for the day
  const day = email.sentAt || new Date();
  day.setUTCHours(0, 0, 0, 0);

  await prisma.outreachDomainDailyStat.upsert({
    where: {
      domainId_day: {
        domainId: email.domainId,
        day,
      },
    },
    create: {
      tenantId,
      domainId: email.domainId,
      day,
      sentCount: 0,
      openCount: 0,
      clickCount: 0,
      replyCount: 1,
    },
    update: {
      replyCount: { increment: 1 },
    },
  });
}

/**
 * Checks if a lead has replied to any outreach email.
 */
export async function hasReplied(leadId: string): Promise<boolean> {
  const replyEvent = await prisma.outreachEmailEvent.findFirst({
    where: {
      leadId,
      type: 'REPLY_RECEIVED',
    },
  });

  return replyEvent !== null;
}
