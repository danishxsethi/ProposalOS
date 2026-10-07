/**
 * Competitor monitoring has no approved provider. Do not infer a competitor
 * change or contact a customer from placeholder data.
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

export type CompetitorMonitorStatus = 'OK' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

export interface CompetitorSignalData {
  competitorName: string;
  competitorUrl?: string;
  changeType:
    | 'competitor_new_review'
    | 'competitor_rating_change'
    | 'competitor_website_update'
    | 'competitor_new_listing';
  severity: 'high' | 'medium' | 'low';
  description: string;
  evidenceId: string;
}

export interface CompetitorMonitorResult {
  status: CompetitorMonitorStatus;
  signals: CompetitorSignalData[];
}

/**
 * Provider boundary. Until a provider is approved and configured, the only
 * truthful result is NOT_CONFIGURED, not "no change".
 */
export async function checkCompetitorChanges(
  tenantId: string,
  targetId: string,
  businessIndustry: string,
  businessCity?: string
): Promise<CompetitorMonitorResult> {
  if (!process.env.COMPETITOR_MONITOR_PROVIDER) {
    return { status: 'NOT_CONFIGURED', signals: [] };
  }

  logger.warn(
    { tenantId, targetId, businessIndustry, businessCity, status: 'UNAVAILABLE' },
    'Competitor monitor provider is configured but no approved adapter is installed'
  );
  return { status: 'UNAVAILABLE', signals: [] };
}

export async function processCompetitorSignals(): Promise<{
  signalsDetected: number;
  upsellsTriggered: number;
  errors: string[];
  notConfigured: number;
  unavailable: number;
}> {
  const errors: string[] = [];
  let notConfigured = 0;
  let unavailable = 0;

  // System enumeration is intentional and audited by runWithTenantBypass.
  const proposals = await runWithTenantBypass('competitor monitor target enumeration', () =>
    prisma.proposal.findMany({
      where: { status: 'ACCEPTED' },
      select: {
        id: true,
        tenantId: true,
        audit: { select: { businessIndustry: true, businessCity: true } },
      },
    })
  );

  for (const proposal of proposals) {
    const industry = proposal.audit?.businessIndustry;
    if (!proposal.tenantId || !industry) continue;
    try {
      const result = await runWithTenantAsync(proposal.tenantId, () =>
        checkCompetitorChanges(
          proposal.tenantId,
          proposal.id,
          industry,
          proposal.audit.businessCity ?? undefined
        )
      );
      if (result.status === 'NOT_CONFIGURED') notConfigured++;
      if (result.status === 'UNAVAILABLE') unavailable++;
    } catch (error) {
      errors.push(`Competitor monitor failed for ${proposal.id}`);
      logger.error({ err: error, proposalId: proposal.id }, 'Competitor monitor failed');
    }
  }

  return { signalsDetected: 0, upsellsTriggered: 0, errors, notConfigured, unavailable };
}
