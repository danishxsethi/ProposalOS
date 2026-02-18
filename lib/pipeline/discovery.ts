/**
 * Prospect Discovery Engine
 *
 * Discovers and qualifies prospects from external sources (Google Maps, Yelp,
 * industry directories). Runs multi-signal qualification, computes Pain Score,
 * applies threshold gating, deduplicates by tenant, respects daily volume limits,
 * and triggers waterfall enrichment for qualified prospects.
 *
 * External source providers are pluggable functions that can be mocked/replaced
 * for testing and different environments.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.9
 */

import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { calculate as calculatePainScore } from './painScore';
import type {
  DiscoveryConfig,
  DiscoveryResult,
  QualificationSignals,
  PainScoreBreakdown,
} from './types';

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Raw business record returned by an external source provider
 */
export interface RawBusinessRecord {
  businessName: string;
  website: string | null;
  city: string;
  state?: string;
  vertical: string;
  address?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  source: string;
  sourceExternalId: string;
  sourceUrl?: string;
}

/**
 * A pluggable provider function that queries an external source
 * and returns raw business records.
 */
export type SourceProvider = (
  city: string,
  vertical: string,
  limit: number,
  state?: string
) => Promise<RawBusinessRecord[]>;

/**
 * A pluggable qualification function that audits a business and returns
 * multi-signal qualification data.
 */
export type QualificationProvider = (
  record: RawBusinessRecord
) => Promise<QualificationSignals>;

// ============================================================================
// Default Provider Stubs
// ============================================================================

/**
 * Default Google Places provider stub.
 * In production, this would call the Google Maps Places API.
 */
export const defaultGooglePlacesProvider: SourceProvider = async (
  _city,
  _vertical,
  _limit,
  _state
) => {
  // Stub: replace with real Google Maps API integration
  return [];
};

/**
 * Default Yelp provider stub.
 * In production, this would call the Yelp Fusion API.
 */
export const defaultYelpProvider: SourceProvider = async (
  _city,
  _vertical,
  _limit,
  _state
) => {
  // Stub: replace with real Yelp API integration
  return [];
};

/**
 * Default directories provider stub.
 * In production, this would scrape/query industry directories.
 */
export const defaultDirectoriesProvider: SourceProvider = async (
  _city,
  _vertical,
  _limit,
  _state
) => {
  // Stub: replace with real directory integration
  return [];
};

/**
 * Default qualification provider stub.
 * In production, this would run a multi-signal audit (Lighthouse, SSL check,
 * GBP API, social media checks, competitor analysis, accessibility scan).
 */
export const defaultQualificationProvider: QualificationProvider = async (
  _record
) => {
  // Stub: returns empty signals — real implementation would run audits
  return {};
};

// ============================================================================
// Discovery Engine Configuration
// ============================================================================

export interface DiscoveryProviders {
  googlePlaces?: SourceProvider;
  yelp?: SourceProvider;
  directories?: SourceProvider;
  qualification?: QualificationProvider;
}

// ============================================================================
// Core Discovery Functions
// ============================================================================

/**
 * Query all enabled external sources and merge results.
 * Deduplicates across sources by sourceExternalId.
 */
export async function queryExternalSources(
  config: DiscoveryConfig,
  providers: DiscoveryProviders
): Promise<RawBusinessRecord[]> {
  const allRecords: RawBusinessRecord[] = [];

  const sourceQueries: Promise<RawBusinessRecord[]>[] = [];

  if (config.sources.googlePlaces) {
    const provider = providers.googlePlaces ?? defaultGooglePlacesProvider;
    sourceQueries.push(
      provider(config.city, config.vertical, config.targetLeads, config.state)
        .catch((err) => {
          console.error('Google Places provider error:', err);
          return [] as RawBusinessRecord[];
        })
    );
  }

  if (config.sources.yelp) {
    const provider = providers.yelp ?? defaultYelpProvider;
    sourceQueries.push(
      provider(config.city, config.vertical, config.targetLeads, config.state)
        .catch((err) => {
          console.error('Yelp provider error:', err);
          return [] as RawBusinessRecord[];
        })
    );
  }

  if (config.sources.directories) {
    const provider = providers.directories ?? defaultDirectoriesProvider;
    sourceQueries.push(
      provider(config.city, config.vertical, config.targetLeads, config.state)
        .catch((err) => {
          console.error('Directories provider error:', err);
          return [] as RawBusinessRecord[];
        })
    );
  }

  const results = await Promise.all(sourceQueries);
  for (const batch of results) {
    allRecords.push(...batch);
  }

  return allRecords;
}

/**
 * Deduplicate records against existing ProspectLeads in the database.
 * Checks for existing records with the same tenantId + source + sourceExternalId.
 *
 * Requirement 1.6: Skip prospects that already exist for the same tenant.
 */
export async function deduplicateRecords(
  records: RawBusinessRecord[],
  tenantId: string
): Promise<RawBusinessRecord[]> {
  if (records.length === 0) return [];

  // Build lookup pairs for batch query
  const lookupPairs = records.map((r) => ({
    source: r.source,
    sourceExternalId: r.sourceExternalId,
  }));

  // Query existing records in one batch
  const existing = await prisma.prospectLead.findMany({
    where: {
      tenantId,
      OR: lookupPairs.map((pair) => ({
        source: pair.source,
        sourceExternalId: pair.sourceExternalId,
      })),
    },
    select: {
      source: true,
      sourceExternalId: true,
    },
  });

  // Build a set of existing keys for O(1) lookup
  const existingKeys = new Set(
    existing.map((e) => `${e.source}::${e.sourceExternalId}`)
  );

  return records.filter(
    (r) => !existingKeys.has(`${r.source}::${r.sourceExternalId}`)
  );
}

/**
 * Get the number of prospects discovered today for a tenant.
 * Used to enforce daily volume limits.
 *
 * Requirement 1.9: Respect tenant daily prospect volume limits.
 */
export async function getTodayDiscoveredCount(
  tenantId: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.prospectLead.count({
    where: {
      tenantId,
      createdAt: { gte: startOfDay },
    },
  });
}

/**
 * Compute remaining daily volume capacity for a tenant.
 */
export async function getRemainingDailyCapacity(
  tenantId: string,
  dailyVolumeLimit: number
): Promise<number> {
  const todayCount = await getTodayDiscoveredCount(tenantId);
  return Math.max(0, dailyVolumeLimit - todayCount);
}

/**
 * Qualify a single prospect: run multi-signal audit and compute Pain Score.
 *
 * Requirements 1.2, 1.3: Run multi-signal qualification and compute Pain Score.
 */
export async function qualifyProspect(
  record: RawBusinessRecord,
  qualificationProvider: QualificationProvider
): Promise<{
  signals: QualificationSignals;
  painScore: number;
  breakdown: PainScoreBreakdown;
}> {
  const signals = await qualificationProvider(record);
  const { total, breakdown } = calculatePainScore(signals);
  return { signals, painScore: total, breakdown };
}

/**
 * Persist a qualified prospect to the database.
 *
 * Requirement 1.7: Persist with status "discovered", Pain Score, breakdown,
 * top 3 findings, and decision-maker contact info.
 */
export async function persistQualifiedProspect(
  record: RawBusinessRecord,
  tenantId: string,
  discoveryJobId: string,
  painScore: number,
  breakdown: PainScoreBreakdown,
  signals: QualificationSignals
): Promise<string> {
  // Derive top 3 findings from the breakdown (highest scoring dimensions)
  const topFindings = deriveTopFindings(breakdown);

  const lead = await prisma.prospectLead.create({
    data: {
      tenantId,
      discoveryJobId,
      source: record.source,
      sourceExternalId: record.sourceExternalId,
      sourceUrl: record.sourceUrl ?? null,
      businessName: record.businessName,
      city: record.city,
      state: record.state ?? null,
      vertical: record.vertical,
      website: record.website,
      address: record.address ?? null,
      phone: record.phone ?? null,
      rating: record.rating ?? null,
      reviewCount: record.reviewCount ?? null,
      painScore: Math.round(painScore),
      painBreakdown: breakdown as Record<string, number>,
      topFindings,
      qualificationEvidence: signals as Record<string, unknown>,
      pipelineStatus: 'discovered',
      qualifiedAt: new Date(),
    },
  });

  return lead.id;
}

/**
 * Derive top 3 findings from pain score breakdown.
 * Returns the 3 dimensions with the highest scores.
 */
export function deriveTopFindings(
  breakdown: PainScoreBreakdown
): Array<{ dimension: string; score: number; label: string }> {
  const dimensionLabels: Record<keyof PainScoreBreakdown, string> = {
    websiteSpeed: 'Slow website speed',
    mobileBroken: 'Mobile experience broken',
    gbpNeglected: 'Google Business Profile neglected',
    noSsl: 'Missing SSL/HTTPS',
    zeroReviewResponses: 'No review responses',
    socialMediaDead: 'Social media inactive',
    competitorsOutperforming: 'Competitors outperforming',
    accessibilityViolations: 'Accessibility violations',
  };

  const entries = (
    Object.entries(breakdown) as [keyof PainScoreBreakdown, number][]
  )
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([dimension, score]) => ({
      dimension,
      score,
      label: dimensionLabels[dimension],
    }));

  return entries;
}

/**
 * Trigger waterfall enrichment for a qualified prospect.
 * This is a fire-and-forget call — enrichment runs asynchronously.
 * The actual enrichment logic is in waterfallEnrichment.ts (task 9.2).
 *
 * Requirement 1.5: Trigger waterfall enrichment for qualified prospects.
 */
export async function triggerEnrichment(leadId: string): Promise<void> {
  // Update the lead status to indicate enrichment is pending
  await prisma.prospectLead.update({
    where: { id: leadId },
    data: {
      status: 'ENRICH_PENDING',
    },
  });

  // The actual waterfall enrichment (Apollo → Hunter → Proxycurl → Clearbit)
  // is implemented in waterfallEnrichment.ts (task 9.2).
  // Here we just mark the lead as ready for enrichment processing.
}

// ============================================================================
// Main Discovery Orchestrator
// ============================================================================

/**
 * Execute a full discovery run for a tenant.
 *
 * Orchestrates: query sources → deduplicate → qualify (multi-signal audit) →
 * compute pain scores → threshold gate → persist qualified → trigger enrichment.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.9
 */
export async function discover(
  config: DiscoveryConfig,
  tenantId: string,
  providers: DiscoveryProviders = {}
): Promise<DiscoveryResult> {
  const jobId = uuidv4();
  const startTime = Date.now();
  let costCents = 0;

  // 1. Fetch tenant pipeline config for daily volume limit
  const pipelineConfig = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });
  const dailyVolumeLimit = pipelineConfig?.dailyVolumeLimit ?? 200;

  // 2. Check remaining daily capacity (Requirement 1.9)
  const remainingCapacity = await getRemainingDailyCapacity(
    tenantId,
    dailyVolumeLimit
  );
  if (remainingCapacity <= 0) {
    return {
      jobId,
      tenantId,
      prospectsFound: 0,
      prospectsQualified: 0,
      costCents: 0,
      completedAt: new Date(),
    };
  }

  // 3. Query external sources (Requirement 1.1)
  const rawRecords = await queryExternalSources(config, providers);

  // 4. Deduplicate against existing records (Requirement 1.6)
  const newRecords = await deduplicateRecords(rawRecords, tenantId);

  // 5. Cap at remaining daily capacity (Requirement 1.9)
  const cappedRecords = newRecords.slice(0, remainingCapacity);

  // 6. Qualify each prospect: run multi-signal audit + compute Pain Score
  const qualificationProvider =
    providers.qualification ?? defaultQualificationProvider;

  let prospectsQualified = 0;
  const qualifiedLeadIds: string[] = [];

  for (const record of cappedRecords) {
    try {
      // Run multi-signal qualification (Requirement 1.2)
      const { signals, painScore, breakdown } = await qualifyProspect(
        record,
        qualificationProvider
      );

      // Threshold gating (Requirement 1.4)
      if (painScore < config.painThreshold) {
        // Below threshold — skip (unqualified)
        continue;
      }

      // Re-check daily capacity before persisting
      const currentRemaining = await getRemainingDailyCapacity(
        tenantId,
        dailyVolumeLimit
      );
      if (currentRemaining <= 0) {
        break;
      }

      // Persist qualified prospect (Requirement 1.7)
      const leadId = await persistQualifiedProspect(
        record,
        tenantId,
        jobId,
        painScore,
        breakdown,
        signals
      );

      qualifiedLeadIds.push(leadId);
      prospectsQualified++;

      // Trigger waterfall enrichment (Requirement 1.5)
      await triggerEnrichment(leadId);
    } catch (err) {
      // Log error but continue processing remaining records
      console.error(
        `Error qualifying prospect ${record.businessName}:`,
        err
      );
    }
  }

  const result: DiscoveryResult = {
    jobId,
    tenantId,
    prospectsFound: rawRecords.length,
    prospectsQualified,
    costCents,
    completedAt: new Date(),
  };

  return result;
}
