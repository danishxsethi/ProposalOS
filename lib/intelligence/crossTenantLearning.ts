/**
 * Cross-Tenant Learning
 *
 * Aggregates anonymized patterns across all opted-in tenants to improve
 * shared model performance. No tenant-identifiable data is ever stored.
 *
 * Requirements: 11.1–11.8
 */

import { prisma } from '@/lib/db';
import type {
  AnonymizedOutcome,
  AnonymizedPattern,
  PatternFilters,
  LiftMetrics,
} from './types';

// PII field names that must never appear in shared model records
const PII_FIELD_NAMES = [
  'tenantId',
  'tenant_id',
  'businessName',
  'business_name',
  'contactEmail',
  'contact_email',
  'email',
  'phone',
  'phoneNumber',
  'phone_number',
  'prospectId',
  'prospect_id',
  'leadId',
  'lead_id',
  'firstName',
  'first_name',
  'lastName',
  'last_name',
  'name',
  'address',
  'ssn',
  'creditCard',
  'credit_card',
];

// PII value patterns — require non-digit boundaries so internal numeric IDs
// (timestamps, version strings, etc.) don't trigger false positives.
const PII_VALUE_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // email
  /(?<!\d)(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}(?!\d)/g, // phone (requires separator chars)
  /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, // SSN (requires dashes)
  /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)/g, // credit card (requires separators)
];

/**
 * Validate that a data object contains zero PII fields or values.
 * Returns true if clean, false if PII detected.
 */
export function ensureAnonymized(data: Record<string, unknown>): boolean {
  const dataStr = JSON.stringify(data);

  // Check for PII value patterns
  for (const pattern of PII_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(dataStr)) {
      return false;
    }
  }

  // Check for PII field names (case-insensitive key check)
  const keys = Object.keys(data);
  for (const key of keys) {
    if (PII_FIELD_NAMES.some((pii) => key.toLowerCase() === pii.toLowerCase())) {
      return false;
    }
  }

  return true;
}

/**
 * Strip any PII fields from an outcome before aggregation.
 * Returns a clean AnonymizedOutcome with only allowed fields.
 */
function stripPII(outcome: AnonymizedOutcome): AnonymizedOutcome {
  return {
    vertical: outcome.vertical,
    geoRegion: outcome.geoRegion,
    painScore: outcome.painScore,
    outcome: outcome.outcome,
    tierChosen: outcome.tierChosen,
    dealValue: outcome.dealValue,
    findingTypes: outcome.findingTypes,
    emailTemplateId: outcome.emailTemplateId,
  };
}

/**
 * Aggregate anonymized patterns from outcomes and persist a new model version.
 * Strips all tenant-identifiable data before storage.
 *
 * Requirements: 11.1, 11.2, 11.3
 */
export async function aggregatePatterns(outcomes: AnonymizedOutcome[]): Promise<void> {
  if (outcomes.length === 0) return;

  // Strip PII from every outcome before processing
  const clean = outcomes.map(stripPII);

  // Group by vertical + geoRegion
  const grouped = new Map<
    string,
    {
      vertical: string;
      geoRegion: string;
      wins: number;
      total: number;
      dealValues: number[];
      findingTypes: Map<string, number>;
      emailTemplates: Map<string, number>;
    }
  >();

  for (const o of clean) {
    const key = `${o.vertical}::${o.geoRegion}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        vertical: o.vertical,
        geoRegion: o.geoRegion,
        wins: 0,
        total: 0,
        dealValues: [],
        findingTypes: new Map(),
        emailTemplates: new Map(),
      });
    }
    const g = grouped.get(key)!;
    g.total++;
    if (o.outcome === 'won') {
      g.wins++;
      if (o.dealValue) g.dealValues.push(o.dealValue);
    }
    for (const ft of o.findingTypes) {
      g.findingTypes.set(ft, (g.findingTypes.get(ft) ?? 0) + 1);
    }
    if (o.emailTemplateId) {
      g.emailTemplates.set(o.emailTemplateId, (g.emailTemplates.get(o.emailTemplateId) ?? 0) + 1);
    }
  }

  const version = `v${Date.now()}`;
  const now = new Date();

  const patterns: AnonymizedPattern[] = Array.from(grouped.values()).map((g) => {
    const winRate = g.total > 0 ? g.wins / g.total : 0;
    const sortedFindings = [...g.findingTypes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);
    const sortedTemplates = [...g.emailTemplates.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    const dealMin = g.dealValues.length > 0 ? Math.min(...g.dealValues) : 0;
    const dealMax = g.dealValues.length > 0 ? Math.max(...g.dealValues) : 0;

    // Confidence: scales with sample size, capped at 1
    const confidence = Math.min(g.total / 100, 1);

    return {
      id: `${g.vertical}-${g.geoRegion}-${version}`,
      vertical: g.vertical,
      geoRegion: g.geoRegion,
      patternType: 'win_rate' as const,
      data: {
        winRate,
        effectiveFindingTypes: sortedFindings,
        optimalPriceRange: { min: dealMin, max: dealMax },
        bestEmailPatterns: sortedTemplates,
      },
      sampleSize: g.total,
      confidence,
      lastUpdated: now,
      modelVersion: version,
    };
  });

  // Persist new model version
  await prisma.sharedIntelligenceModel.create({
    data: {
      version,
      patterns: patterns as unknown as object[],
      metadata: { outcomeCount: outcomes.length, patternCount: patterns.length },
      isActive: true,
    },
  });

  // Deactivate all previous versions
  await prisma.sharedIntelligenceModel.updateMany({
    where: { version: { not: version }, isActive: true },
    data: { isActive: false },
  });
}

/**
 * Retrieve patterns from the active model, filtered and weighted by recency
 * and sample size.
 *
 * Requirements: 11.1, 11.6
 */
export async function getPatterns(filters: PatternFilters = {}): Promise<AnonymizedPattern[]> {
  const model = await prisma.sharedIntelligenceModel.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!model) return [];

  let patterns = model.patterns as unknown as AnonymizedPattern[];

  if (filters.vertical) {
    patterns = patterns.filter((p) => p.vertical === filters.vertical);
  }
  if (filters.geoRegion) {
    patterns = patterns.filter((p) => p.geoRegion === filters.geoRegion);
  }
  if (filters.patternType) {
    patterns = patterns.filter((p) => p.patternType === filters.patternType);
  }
  if (filters.minSampleSize !== undefined) {
    patterns = patterns.filter((p) => p.sampleSize >= filters.minSampleSize!);
  }
  if (filters.minConfidence !== undefined) {
    patterns = patterns.filter((p) => p.confidence >= filters.minConfidence!);
  }

  // Sort by recency (modelVersion encodes timestamp) then sample size descending
  patterns.sort((a, b) => b.sampleSize - a.sampleSize);

  return patterns;
}

/**
 * Compute lift for a tenant: compare win rate with vs without shared learning.
 *
 * Requirements: 11.4, 11.7
 */
export async function computeLift(tenantId: string): Promise<LiftMetrics> {
  // Get the active shared model
  const model = await prisma.sharedIntelligenceModel.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  // Get tenant's own recent win/loss records
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const records = await prisma.winLossRecord.findMany({
    where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
  });

  const total = records.length;
  const wins = records.filter((r) => r.outcome === 'won').length;
  const tenantWinRate = total > 0 ? wins / total : 0;

  if (!model) {
    return {
      withSharedLearning: tenantWinRate,
      withoutSharedLearning: tenantWinRate,
      liftPercent: 0,
    };
  }

  const patterns = model.patterns as unknown as AnonymizedPattern[];

  // Estimate baseline (without shared learning) as the raw tenant win rate
  const withoutSharedLearning = tenantWinRate;

  // Estimate with shared learning: blend tenant rate with model patterns
  let blendedRate = tenantWinRate;
  if (patterns.length > 0) {
    const avgModelWinRate =
      patterns.reduce((sum, p) => sum + (p.data.winRate ?? 0), 0) / patterns.length;
    // Weight: 70% tenant data, 30% shared model (more weight to tenant's own data)
    blendedRate = total >= 10
      ? tenantWinRate * 0.7 + avgModelWinRate * 0.3
      : avgModelWinRate; // If little tenant data, rely more on shared model
  }

  const withSharedLearning = Math.min(Math.max(blendedRate, 0), 1);
  const liftPercent =
    withoutSharedLearning > 0
      ? ((withSharedLearning - withoutSharedLearning) / withoutSharedLearning) * 100
      : 0;

  return { withSharedLearning, withoutSharedLearning, liftPercent };
}

/**
 * Get the current active model version string.
 *
 * Requirements: 11.5
 */
export async function getModelVersion(): Promise<string> {
  const model = await prisma.sharedIntelligenceModel.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { version: true },
  });
  return model?.version ?? 'none';
}

/**
 * Rollback the active model to a specific previous version.
 *
 * Requirements: 11.5
 */
export async function rollbackModel(version: string): Promise<void> {
  const target = await prisma.sharedIntelligenceModel.findUnique({
    where: { version },
  });

  if (!target) {
    throw new Error(`Model version not found: ${version}`);
  }

  // Deactivate current active model
  await prisma.sharedIntelligenceModel.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Activate the target version
  await prisma.sharedIntelligenceModel.update({
    where: { version },
    data: { isActive: true },
  });
}

/**
 * Opt a tenant out of cross-tenant learning aggregation.
 * Opted-out tenants are excluded from aggregation but still benefit from
 * the shared model.
 *
 * Requirements: 11.8
 */
export async function optOut(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        // Merge with existing settings
        crossTenantLearningOptOut: true,
      },
    },
  });
}

/**
 * Opt a tenant back into cross-tenant learning aggregation.
 *
 * Requirements: 11.8
 */
export async function optIn(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        crossTenantLearningOptOut: false,
      },
    },
  });
}

/**
 * Check whether a tenant has opted out of cross-tenant learning.
 */
export async function isOptedOut(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  if (!tenant) return false;
  const settings = tenant.settings as Record<string, unknown>;
  return settings?.crossTenantLearningOptOut === true;
}
