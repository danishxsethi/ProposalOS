import { promises as dnsPromises } from 'dns';

import { OutreachEmailStatus, OutreachSendingDomain } from '@prisma/client';

import { FeatureFlagService } from '@/lib/config/FeatureFlagService';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

const DEFAULT_DAILY_LIMIT = Math.max(
  1,
  Math.min(250, Number(process.env.OUTREACH_DOMAIN_DAILY_LIMIT || 50))
);

interface ParsedSender {
  domain: string;
  fromEmail: string;
  fromName: string;
}

function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toEmailSender(value: string): ParsedSender | null {
  const fallbackName = process.env.OUTREACH_SENDER_NAME?.trim() || 'ProposalOS';
  const hasAt = value.includes('@');
  const fromEmail = hasAt ? value.toLowerCase() : `hello@${value.toLowerCase()}`;
  const emailMatch = fromEmail.match(/^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!emailMatch) return null;

  return {
    domain: emailMatch[1]!.toLowerCase(),
    fromEmail,
    fromName: fallbackName,
  };
}

function configuredSenders(): ParsedSender[] {
  const rawSenders = [
    ...parseList(process.env.OUTREACH_SENDING_EMAILS),
    ...parseList(process.env.OUTREACH_SENDING_DOMAINS),
  ];

  const parsed = rawSenders
    .map((value) => toEmailSender(value))
    .filter((value): value is ParsedSender => value !== null);

  const uniq = new Map<string, ParsedSender>();
  for (const sender of parsed) {
    uniq.set(sender.fromEmail, sender);
  }
  return [...uniq.values()];
}

export async function ensureSendingDomains(tenantId: string): Promise<OutreachSendingDomain[]> {
  const configured = configuredSenders();
  if (configured.length === 0) {
    return prisma.outreachSendingDomain.findMany({
      where: { tenantId, isActive: true },
      orderBy: { fromEmail: 'asc' },
    });
  }

  for (const sender of configured) {
    await prisma.outreachSendingDomain.upsert({
      where: {
        tenantId_fromEmail: {
          tenantId,
          fromEmail: sender.fromEmail,
        },
      },
      update: {
        domain: sender.domain,
        fromName: sender.fromName,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        isActive: true,
      },
      create: {
        tenantId,
        domain: sender.domain,
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        dailyLimit: DEFAULT_DAILY_LIMIT,
        isActive: true,
      },
    });
  }

  return prisma.outreachSendingDomain.findMany({
    where: { tenantId, isActive: true },
    orderBy: { fromEmail: 'asc' },
  });
}

/**
 * Calculates daily limits based on a configurable warmup curve.
 * Curve: Start low (10), increase 20% daily to a ceiling.
 */
export function calculateWarmupLimit(domain: OutreachSendingDomain, daysActive: number): number {
  const startVolume = 10;
  const growthMultiplier = 1.2;
  const maxCeiling = domain.dailyLimit || 50;

  // startVolume * (1.2 ^ (daysActive - 1))
  const warmupCap = Math.floor(startVolume * Math.pow(growthMultiplier, daysActive - 1));
  return Math.max(1, Math.min(maxCeiling, warmupCap));
}

/**
 * Validates SPF, DKIM, and DMARC config checks via DNS resolver.
 * Blocks live sending if misconfigured.
 */
export async function verifyDomainDns(domainName: string): Promise<{
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  ready: boolean;
}> {
  // In tests or sandbox dry-run modes, return full compliance by default
  const isLive = await FeatureFlagService.isEnabled('OUTREACH_LIVE_SENDING');
  if (!isLive || process.env.NODE_ENV === 'test' || process.env.BYPASS_DNS_CHECK === 'true') {
    return { spf: true, dkim: true, dmarc: true, ready: true };
  }

  let spf = false;
  let dkim = false;
  let dmarc = false;

  try {
    // 1. SPF Check (check TXT records on main domain for "v=spf1")
    const txtRecords = await dnsPromises.resolveTxt(domainName);
    for (const record of txtRecords) {
      const fullRecord = record.join(' ');
      if (fullRecord.includes('v=spf1')) {
        spf = true;
        break;
      }
    }
  } catch (err) {
    logger.warn({ domainName, error: err }, 'SPF lookup failed');
  }

  try {
    // 2. DMARC Check (check TXT records on _dmarc.domain for "v=DMARC1")
    const dmarcRecords = await dnsPromises.resolveTxt(`_dmarc.${domainName}`);
    for (const record of dmarcRecords) {
      const fullRecord = record.join(' ');
      if (fullRecord.includes('v=DMARC1')) {
        dmarc = true;
        break;
      }
    }
  } catch (err) {
    logger.warn({ domainName, error: err }, 'DMARC lookup failed');
  }

  try {
    // 3. DKIM Check (using default Resend selector "resend._domainkey" or similar fallback)
    const dkimRecords = await dnsPromises.resolveTxt(`resend._domainkey.${domainName}`);
    for (const record of dkimRecords) {
      const fullRecord = record.join(' ');
      if (fullRecord.includes('v=DKIM1') || fullRecord.includes('k=rsa')) {
        dkim = true;
        break;
      }
    }
  } catch (err) {
    logger.warn({ domainName, error: err }, 'DKIM lookup failed');
  }

  return {
    spf,
    dkim,
    dmarc,
    ready: spf && dkim && dmarc,
  };
}

/**
 * Checks a domain's health scoring (bounces, complaints) and auto-pauses unhealthy ones.
 */
export async function checkAndEnforceDomainHealth(
  domainId: string,
  tenantId: string
): Promise<boolean> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Total emails processed by this domain in past 30 days
  const totalSent = await prisma.outreachEmail.count({
    where: {
      domainId,
      tenantId,
      sentAt: { gte: thirtyDaysAgo },
    },
  });

  if (totalSent < 10) {
    // Insufficient statistical volume to evaluate health
    return true;
  }

  // Count bounces (emails marked FAILED with bounce-related messages or suppressed)
  const bounceCount = await prisma.outreachEmail.count({
    where: {
      domainId,
      tenantId,
      sentAt: { gte: thirtyDaysAgo },
      status: OutreachEmailStatus.FAILED,
      errorMessage: {
        contains: 'bounce',
        mode: 'insensitive',
      },
    },
  });

  const bounceRate = bounceCount / totalSent;

  if (bounceRate > 0.05) {
    logger.warn(
      { domainId, tenantId, totalSent, bounceCount, bounceRate },
      'Auto-pausing domain: bounce rate exceeded 5%'
    );

    await prisma.outreachSendingDomain.update({
      where: { id: domainId },
      data: { isActive: false },
    });

    return false;
  }

  return true;
}

export async function selectDomainForSend(tenantId: string): Promise<{
  domain: OutreachSendingDomain;
  todaysSent: number;
} | null> {
  const domains = await ensureSendingDomains(tenantId);
  if (domains.length === 0) return null;

  const day = utcDayStart();
  const candidates: Array<{ domain: OutreachSendingDomain; todaysSent: number }> = [];

  const warmupEnabled = await FeatureFlagService.isEnabled('EMAIL_WARMUP_ENABLED');

  for (const domain of domains) {
    if (!domain.isActive) continue;

    // Evaluate health scoring. If unhealthy, it auto-pauses and gets skipped.
    const isHealthy = await checkAndEnforceDomainHealth(domain.id, tenantId);
    if (!isHealthy) continue;

    // Verify SPF/DKIM/DMARC DNS assertions before live sending
    const dnsStatus = await verifyDomainDns(domain.domain);
    if (!dnsStatus.ready) {
      logger.warn({ domain: domain.domain }, 'Domain DNS assertions failed checks. Skipped.');
      continue;
    }

    const stat = await prisma.outreachDomainDailyStat.upsert({
      where: {
        domainId_day: {
          domainId: domain.id,
          day,
        },
      },
      update: {},
      create: {
        tenantId,
        domainId: domain.id,
        day,
      },
    });

    let allowedDailyLimit = domain.dailyLimit;
    if (warmupEnabled) {
      const daysActive = Math.max(
        1,
        Math.ceil((Date.now() - domain.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      );
      allowedDailyLimit = calculateWarmupLimit(domain, daysActive);
    }

    if (stat.sentCount < allowedDailyLimit) {
      candidates.push({ domain, todaysSent: stat.sentCount });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.todaysSent - b.todaysSent);
  return candidates[0]!;
}

export async function incrementDomainCounter(
  domainId: string,
  tenantId: string,
  counter: 'sentCount' | 'openCount' | 'clickCount' | 'replyCount'
): Promise<void> {
  const day = utcDayStart();
  await prisma.outreachDomainDailyStat.upsert({
    where: {
      domainId_day: {
        domainId,
        day,
      },
    },
    update: {
      [counter]: { increment: 1 },
    },
    create: {
      tenantId,
      domainId,
      day,
      [counter]: 1,
    },
  });
}
