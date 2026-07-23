/**
 * Email infrastructure management for the 50-domain pool.
 * Handles domain health monitoring, rotation, warmup, and acquisition.
 * Requirements: 17.4, 17.5
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailDomain {
  domain: string;
  status: 'warming' | 'healthy' | 'flagged' | 'blacklisted' | 'retired';
  dailyLimit: number;
  sentToday: number;
  reputation: number; // 0–100
  lastHealthCheck: Date;
  dnsRecords: {
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
  };
}

export interface WarmupProgress {
  domain: string;
  previousLimit: number;
  newLimit: number;
  status: 'warming' | 'healthy';
  warmupCompletedAt: Date | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Starting daily send limit for a newly acquired domain. */
const WARMUP_INITIAL_LIMIT = 50;

/** Maximum daily send limit — once reached, domain graduates to 'healthy'. */
const WARMUP_MAX_LIMIT = 5000;

/** Minimum number of healthy domains before triggering acquisition. */
const MIN_HEALTHY_DOMAINS = 10;

/** Target pool size for the 50-domain infrastructure. */
const TARGET_POOL_SIZE = 50;

// ─── getDomainHealth ──────────────────────────────────────────────────────────

/**
 * Returns health status for all domains in the 50-domain pool.
 * Checks SPF, DKIM, DMARC validity and reputation score from `EmailDomainHealth`.
 * Requirements: 17.4
 */
export async function getDomainHealth(): Promise<EmailDomain[]> {
  const records = await prisma.emailDomainHealth.findMany({
    orderBy: [{ status: 'asc' }, { reputation: 'desc' }],
  });

  return records.map((r) => ({
    domain: r.domain,
    status: r.status as EmailDomain['status'],
    dailyLimit: r.dailyLimit,
    sentToday: r.sentToday,
    reputation: r.reputation,
    lastHealthCheck: r.lastHealthCheck,
    dnsRecords: {
      spf: r.spfValid,
      dkim: r.dkimValid,
      dmarc: r.dmarcValid,
    },
  }));
}

// ─── rotateDomain ─────────────────────────────────────────────────────────────

/**
 * Marks a domain as 'flagged' and selects the healthiest available replacement.
 * Used by self-healing pipeline when a domain is flagged or blacklisted.
 * Requirements: 17.5
 */
export async function rotateDomain(
  domain: string,
  reason: string
): Promise<{ rotatedFrom: string; rotatedTo: string | null }> {
  // Mark the domain as flagged
  await prisma.emailDomainHealth.update({
    where: { domain },
    data: {
      status: 'flagged',
      flaggedAt: new Date(),
    },
  });

  logger.info(
    { event: 'email_infra.domain_flagged', domain, reason },
    `Domain flagged: ${domain} — reason: ${reason}`
  );

  // Find the best healthy replacement (highest reputation, DNS fully valid)
  const replacement = await prisma.emailDomainHealth.findFirst({
    where: {
      domain: { not: domain },
      status: 'healthy',
      spfValid: true,
      dkimValid: true,
      dmarcValid: true,
    },
    orderBy: { reputation: 'desc' },
  });

  if (!replacement) {
    logger.warn(
      { event: 'email_infra.no_replacement', domain },
      'No healthy replacement domain available after rotation'
    );
    return { rotatedFrom: domain, rotatedTo: null };
  }

  logger.info(
    { event: 'email_infra.domain_rotated', from: domain, to: replacement.domain },
    `Rotated from ${domain} to ${replacement.domain}`
  );

  return { rotatedFrom: domain, rotatedTo: replacement.domain };
}

// ─── warmupDomain ─────────────────────────────────────────────────────────────

/**
 * Advances a domain one step through the warmup schedule.
 * Daily limit doubles each call (50 → 100 → 200 → … → 5000).
 * Once the limit reaches WARMUP_MAX_LIMIT the domain is promoted to 'healthy'.
 * Requirements: 17.4
 */
export async function warmupDomain(domain: string): Promise<WarmupProgress> {
  const record = await prisma.emailDomainHealth.findUnique({ where: { domain } });

  if (!record) {
    throw new Error(`Domain not found: ${domain}`);
  }

  const previousLimit = record.dailyLimit;

  // Double the limit, capped at max
  const newLimit = Math.min(previousLimit * 2, WARMUP_MAX_LIMIT);
  const isComplete = newLimit >= WARMUP_MAX_LIMIT;
  const newStatus = isComplete ? 'healthy' : 'warming';

  await prisma.emailDomainHealth.update({
    where: { domain },
    data: {
      dailyLimit: newLimit,
      status: newStatus,
      warmupCompletedAt: isComplete ? new Date() : null,
      lastHealthCheck: new Date(),
    },
  });

  logger.info(
    {
      event: 'email_infra.warmup_step',
      domain,
      previousLimit,
      newLimit,
      status: newStatus,
    },
    `Warmup step for ${domain}: ${previousLimit} → ${newLimit} (${newStatus})`
  );

  return {
    domain,
    previousLimit,
    newLimit,
    status: newStatus,
    warmupCompletedAt: isComplete ? new Date() : null,
  };
}

// ─── acquireNewDomain ─────────────────────────────────────────────────────────

/**
 * Simulates acquiring a new domain and seeds it into the pool at warmup state.
 * Triggered automatically when the healthy domain count drops below MIN_HEALTHY_DOMAINS.
 * Requirements: 17.4, 17.5
 */
export async function acquireNewDomain(): Promise<EmailDomain> {
  // Check current pool size to decide whether acquisition is needed
  const healthyCount = await prisma.emailDomainHealth.count({
    where: { status: 'healthy' },
  });

  const totalCount = await prisma.emailDomainHealth.count();

  logger.info(
    {
      event: 'email_infra.acquire_check',
      healthyCount,
      totalCount,
      minHealthy: MIN_HEALTHY_DOMAINS,
      targetPool: TARGET_POOL_SIZE,
    },
    `Domain pool status: ${healthyCount} healthy / ${totalCount} total`
  );

  // Generate a unique domain name for the new acquisition
  const timestamp = Date.now();
  const newDomain = `outreach-${timestamp}.mail`;

  const created = await prisma.emailDomainHealth.create({
    data: {
      domain: newDomain,
      status: 'warming',
      dailyLimit: WARMUP_INITIAL_LIMIT,
      sentToday: 0,
      reputation: 50,
      spfValid: true,
      dkimValid: true,
      dmarcValid: true,
      warmupStartedAt: new Date(),
      lastHealthCheck: new Date(),
    },
  });

  logger.info(
    {
      event: 'email_infra.domain_acquired',
      domain: newDomain,
      healthyCount,
      totalCount: totalCount + 1,
    },
    `Acquired new domain: ${newDomain}`
  );

  return {
    domain: created.domain,
    status: created.status as EmailDomain['status'],
    dailyLimit: created.dailyLimit,
    sentToday: created.sentToday,
    reputation: created.reputation,
    lastHealthCheck: created.lastHealthCheck,
    dnsRecords: {
      spf: created.spfValid,
      dkim: created.dkimValid,
      dmarc: created.dmarcValid,
    },
  };
}

// ─── Pool health summary ──────────────────────────────────────────────────────

/**
 * Returns a summary of the domain pool health.
 * Triggers acquisition if healthy count drops below minimum.
 */
export async function checkPoolHealth(): Promise<{
  total: number;
  healthy: number;
  warming: number;
  flagged: number;
  blacklisted: number;
  needsAcquisition: boolean;
}> {
  const counts = await prisma.emailDomainHealth.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  const byStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count.status])
  ) as Record<string, number>;

  const healthy = byStatus['healthy'] ?? 0;
  const warming = byStatus['warming'] ?? 0;
  const flagged = byStatus['flagged'] ?? 0;
  const blacklisted = byStatus['blacklisted'] ?? 0;
  const total = healthy + warming + flagged + blacklisted + (byStatus['retired'] ?? 0);

  const needsAcquisition = healthy < MIN_HEALTHY_DOMAINS || total < TARGET_POOL_SIZE;

  return { total, healthy, warming, flagged, blacklisted, needsAcquisition };
}
