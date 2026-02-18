import { prisma } from '@/lib/db';
import { PainScoreBreakdown } from './types';

export interface AnonymizedPattern {
  vertical: string;
  geoRegion: string;
  winRate: number;
  effectiveFindingTypes: string[];
  optimalPriceRange: { min: number; max: number };
  bestEmailPatterns: string[];
  sampleSize: number;
}

export interface PredictiveScore {
  closeProb: number; // 0-100
  confidence: number; // 0-1
  factors: { factor: string; weight: number; value: number }[];
  modelVersion: string;
}

export interface CrossTenantIntelligence {
  aggregatePatterns(tenantId: string, outcomes: WinLossData[]): Promise<void>;
  predictCloseProb(prospect: ProspectContext): Promise<PredictiveScore>;
  getModelVersion(): string;
  rollbackModel(version: string): Promise<void>;
  ensureAnonymized(data: Record<string, unknown>): boolean;
}

export interface WinLossData {
  outcome: 'won' | 'lost' | 'ghosted';
  tierChosen?: string;
  dealValue?: number;
  lostReason?: string;
  objectionsRaised?: string[];
  competitorMentioned?: string;
  vertical: string;
  city: string;
  painScore: number;
}

export interface ProspectContext {
  vertical: string;
  painScore: number;
  geoRegion: string;
  businessSize?: string;
}

/**
 * PII patterns to detect in data
 */
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  ssn: /\d{3}-\d{2}-\d{4}/g,
  creditCard: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,
  businessName: /^[A-Z][a-zA-Z\s&]+(?:Inc|LLC|Corp|Ltd|Co|Company|Group|Partners)?$/,
};

/**
 * Aggregate anonymized patterns from win/loss outcomes
 */
export async function aggregatePatterns(
  tenantId: string,
  outcomes: WinLossData[]
): Promise<void> {
  if (outcomes.length === 0) {
    return;
  }

  // Group outcomes by vertical and region
  const patterns = new Map<string, AnonymizedPattern>();

  for (const outcome of outcomes) {
    const key = `${outcome.vertical}:${outcome.city}`;

    if (!patterns.has(key)) {
      patterns.set(key, {
        vertical: outcome.vertical,
        geoRegion: outcome.city,
        winRate: 0,
        effectiveFindingTypes: [],
        optimalPriceRange: { min: 0, max: 0 },
        bestEmailPatterns: [],
        sampleSize: 0,
      });
    }

    const pattern = patterns.get(key)!;
    pattern.sampleSize++;

    if (outcome.outcome === 'won') {
      pattern.winRate = (pattern.winRate * (pattern.sampleSize - 1) + 1) / pattern.sampleSize;
    } else {
      pattern.winRate = (pattern.winRate * (pattern.sampleSize - 1)) / pattern.sampleSize;
    }

    // Track price ranges for won deals
    if (outcome.outcome === 'won' && outcome.dealValue) {
      if (pattern.optimalPriceRange.min === 0) {
        pattern.optimalPriceRange.min = outcome.dealValue;
        pattern.optimalPriceRange.max = outcome.dealValue;
      } else {
        pattern.optimalPriceRange.min = Math.min(pattern.optimalPriceRange.min, outcome.dealValue);
        pattern.optimalPriceRange.max = Math.max(pattern.optimalPriceRange.max, outcome.dealValue);
      }
    }
  }

  // Create new model version
  const version = `v${Date.now()}`;
  const patternsArray = Array.from(patterns.values());

  await prisma.sharedIntelligenceModel.create({
    data: {
      version,
      patterns: patternsArray,
      isActive: true,
    },
  });

  // Deactivate previous versions
  await prisma.sharedIntelligenceModel.updateMany({
    where: {
      version: { not: version },
      isActive: true,
    },
    data: {
      isActive: false,
    },
  });
}

/**
 * Predict close probability for a prospect
 */
export async function predictCloseProb(prospect: ProspectContext): Promise<PredictiveScore> {
  // Get active model
  const model = await prisma.sharedIntelligenceModel.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!model) {
    // No model available, return neutral prediction
    return {
      closeProb: 50,
      confidence: 0,
      factors: [],
      modelVersion: 'none',
    };
  }

  const patterns = model.patterns as AnonymizedPattern[];
  const key = `${prospect.vertical}:${prospect.geoRegion}`;

  // Find matching pattern
  const matchingPattern = patterns.find(
    (p) => p.vertical === prospect.vertical && p.geoRegion === prospect.geoRegion
  );

  if (!matchingPattern) {
    // No pattern for this vertical/region, return neutral
    return {
      closeProb: 50,
      confidence: 0.3,
      factors: [],
      modelVersion: model.version,
    };
  }

  // Calculate close probability based on factors
  const factors: { factor: string; weight: number; value: number }[] = [];

  // Factor 1: Win rate (40% weight)
  const winRateFactor = matchingPattern.winRate * 100;
  factors.push({ factor: 'historical_win_rate', weight: 0.4, value: winRateFactor });

  // Factor 2: Pain score (30% weight) - higher pain = higher close prob
  const painScoreFactor = Math.min(prospect.painScore, 100);
  factors.push({ factor: 'pain_score', weight: 0.3, value: painScoreFactor });

  // Factor 3: Sample size confidence (20% weight)
  const confidenceFactor = Math.min(matchingPattern.sampleSize / 100, 1) * 100;
  factors.push({ factor: 'sample_size_confidence', weight: 0.2, value: confidenceFactor });

  // Factor 4: Price range alignment (10% weight)
  const priceAlignmentFactor = 50; // Neutral default
  factors.push({ factor: 'price_alignment', weight: 0.1, value: priceAlignmentFactor });

  // Calculate weighted close probability
  const closeProb = factors.reduce((sum, f) => sum + f.value * f.weight, 0);

  // Calculate confidence based on sample size
  const confidence = Math.min(matchingPattern.sampleSize / 100, 1);

  return {
    closeProb: Math.min(Math.max(closeProb, 0), 100),
    confidence,
    factors,
    modelVersion: model.version,
  };
}

/**
 * Get current model version
 */
export function getModelVersion(): string {
  return 'v1'; // Placeholder - would be fetched from database in production
}

/**
 * Rollback to a previous model version
 */
export async function rollbackModel(version: string): Promise<void> {
  // Deactivate current active model
  await prisma.sharedIntelligenceModel.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // Activate specified version
  const result = await prisma.sharedIntelligenceModel.updateMany({
    where: { version },
    data: { isActive: true },
  });

  if (result.count === 0) {
    throw new Error(`Model version not found: ${version}`);
  }
}

/**
 * Check if data contains PII
 */
export function ensureAnonymized(data: Record<string, unknown>): boolean {
  const dataStr = JSON.stringify(data);

  // Check for email addresses
  if (PII_PATTERNS.email.test(dataStr)) {
    return false;
  }

  // Check for phone numbers
  if (PII_PATTERNS.phone.test(dataStr)) {
    return false;
  }

  // Check for SSN
  if (PII_PATTERNS.ssn.test(dataStr)) {
    return false;
  }

  // Check for credit card numbers
  if (PII_PATTERNS.creditCard.test(dataStr)) {
    return false;
  }

  return true;
}

/**
 * Remove PII from data
 */
export function anonymizeData(data: Record<string, unknown>): Record<string, unknown> {
  const dataStr = JSON.stringify(data);

  let anonymized = dataStr
    .replace(PII_PATTERNS.email, '[EMAIL]')
    .replace(PII_PATTERNS.phone, '[PHONE]')
    .replace(PII_PATTERNS.ssn, '[SSN]')
    .replace(PII_PATTERNS.creditCard, '[CARD]');

  return JSON.parse(anonymized);
}
