/**
 * lib/retention/upsellTrigger.ts
 *
 * Task 3: Auto-generate an upsell proposal when a competitor shows significant
 * improvement signals in a scheduled re-audit.
 *
 * Called from: app/api/cron/scheduled-audits/route.ts after each audit completes.
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export interface CompetitorSignal {
  /** Unique competitor identifier (URL or name) */
  name: string;
  reviewCount?: number;
  rating?: number;
  websiteHash?: string;
}

interface AuditCompetitorSnapshot {
  competitors?: CompetitorSignal[];
}

export type CompetitorComparisonResult = {
  triggered: boolean;
  reason: string;
  status: 'SIGNAL' | 'UNCHANGED' | 'UNAVAILABLE' | 'INCOMPATIBLE';
};

function competitorKey(competitor: CompetitorSignal): string | null {
  const name = competitor.name.trim().toLowerCase();
  return name ? `${name}|${competitor.websiteHash ?? ''}` : null;
}

/**
 * Compare current audit's competitor evidence with the previous audit's.
 * Returns true if any competitor gained ≥20 reviews OR changed website.
 */
export async function detectCompetitorImprovement(
  tenantId: string,
  previousAuditId: string,
  currentAuditId: string
): Promise<CompetitorComparisonResult> {
  try {
    const [prevSnap, currSnap] = await Promise.all([
      prisma.evidenceSnapshot.findFirst({
        where: { auditId: previousAuditId, tenantId, module: 'competitor' },
      }),
      prisma.evidenceSnapshot.findFirst({
        where: { auditId: currentAuditId, tenantId, module: 'competitor' },
      }),
    ]);

    if (!prevSnap || !currSnap) {
      return { triggered: false, reason: 'Competitor evidence is unavailable', status: 'UNAVAILABLE' };
    }
    if (prevSnap.source !== currSnap.source) {
      return { triggered: false, reason: 'Competitor evidence sources are incompatible', status: 'INCOMPATIBLE' };
    }

    const prev = (prevSnap.rawResponse as AuditCompetitorSnapshot)?.competitors ?? [];
    const curr = (currSnap.rawResponse as AuditCompetitorSnapshot)?.competitors ?? [];
    const previousByKey = new Map<string, CompetitorSignal>();
    for (const competitor of prev) {
      const key = competitorKey(competitor);
      if (key && !previousByKey.has(key)) previousByKey.set(key, competitor);
    }

    for (const currComp of curr) {
      const key = competitorKey(currComp);
      const prevComp = key ? previousByKey.get(key) : undefined;
      if (!prevComp) continue;

      // Signal 1: Competitor gained ≥20 reviews
      const reviewDelta = (currComp.reviewCount ?? 0) - (prevComp.reviewCount ?? 0);
      if (reviewDelta >= 20) {
        return {
          triggered: true,
          reason: `Competitor "${currComp.name}" gained ${reviewDelta} new reviews`,
          status: 'SIGNAL',
        };
      }

      // Signal 2: Competitor changed website (hash differs)
      if (
        currComp.websiteHash &&
        prevComp.websiteHash &&
        currComp.websiteHash !== prevComp.websiteHash
      ) {
        return {
          triggered: true,
          reason: `Competitor "${currComp.name}" launched a new website`,
          status: 'SIGNAL',
        };
      }
    }

    return { triggered: false, reason: 'No compatible competitor changes detected', status: 'UNCHANGED' };
  } catch (error) {
    logger.error({ err: error, tenantId }, '[UpsellTrigger] competitor evidence unavailable');
    return { triggered: false, reason: 'Competitor evidence is unavailable', status: 'UNAVAILABLE' };
  }
}

/**
 * Create an upsell Proposal linked to the current audit, routed through
 * the standard proposal generation with type: 'upsell'.
 */
export async function triggerUpsellProposal(
  tenantId: string,
  auditId: string,
  reason: string
): Promise<{ proposalId: string } | null> {
  try {
    // Tenant/target validation: the source audit must belong to the calling tenant.
    const audit = await prisma.audit.findFirst({ where: { id: auditId, tenantId } });
    if (!audit) return null;

    // Idempotency: at most one open upsell proposal per (tenant, audit).
    const candidates = await prisma.proposal.findMany({
      where: { auditId, tenantId },
      select: { id: true, nextSteps: true },
    });
    const existingUpsell = candidates.find((r) =>
      r.nextSteps?.some((s) => s.startsWith('[upsell:true]'))
    );

    if (existingUpsell) {
      logger.info(
        { proposalId: existingUpsell.id, auditId, tenantId },
        '[UpsellTrigger] Upsell proposal already exists — reusing'
      );
      return { proposalId: existingUpsell.id };
    }

    // Create a fresh proposal record tagged as upsell
    const proposal = await prisma.proposal.create({
      data: {
        auditId,
        tenantId,
        status: 'DRAFT',
        executiveSummary: `Upsell opportunity flagged by automated re-audit: ${reason}`,
        // Signal the proposal pipeline to use 'upsell' mode via metadata in nextSteps
        nextSteps: [`[upsell:true] ${reason}`],
      },
    });

    logger.info(
      { proposalId: proposal.id, auditId, tenantId, reason },
      '[UpsellTrigger] Upsell proposal created'
    );

    return { proposalId: proposal.id };
  } catch (error) {
    logger.error(
      { err: error, auditId, tenantId },
      '[UpsellTrigger] Failed to create upsell proposal'
    );
    return null;
  }
}
