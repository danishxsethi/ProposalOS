// Module result types
export interface AuditModuleResult {
  findings: Finding[];
  evidenceSnapshots: any[];
  execution?: {
    state: 'complete' | 'partial' | 'unavailable' | 'failed';
    reason?: string;
  };
  unavailableChecks?: string[];
  /** Legacy: modules may include moduleId for runner compatibility */
  moduleId?: string;
  /** Normalized data for finding generator compatibility (scores, coreWebVitals, finalUrl, schemaAnalysis, conversionAnalysis) */
  data?: {
    scores?: Record<string, number>;
    coreWebVitals?: any;
    finalUrl?: string;
    schemaAnalysis?: unknown;
    conversionAnalysis?: unknown;
  };
}

// Legacy format — modules (gbp, competitor, social, reputation) return this; runner handles both
export interface LegacyAuditModuleResult {
  moduleId: string;
  status: 'success' | 'failed';
  data: any;
  error?: string;
  timestamp: string;
  costCents?: number;
}

export interface WebsiteModuleInput {
  url: string;
  businessName?: string;
  /**
   * When provided, threaded through to the shared `websiteCrawler` module so its
   * single-flight coalescing (P1-27, Wave 7) can recognize this call as the same
   * logical crawl as the canonical `websiteCrawler` registry module's own call for
   * the same audit, avoiding a second real 20-page crawl of the same site.
   */
  auditId?: string;
}

// Finding types
export type FindingType = 'PAINKILLER' | 'VITAMIN' | 'VISUAL_UX' | 'VISUAL_DESIGN' | 'VISUAL_COMPARISON';
export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Finding {
  module?: string;
  type: FindingType;
  category: string;
  title: string;
  description?: string;
  impactScore: number;
  confidenceScore: number;
  evidence: Array<Evidence | EvidenceItem>;
  metrics: Record<string, any>;
  effortEstimate: EffortLevel;
  recommendedFix: string[];
}

export interface EvidenceItem {
  type: 'url' | 'metric' | 'text' | 'image' | 'link';
  value: any;
  label: string;
}

/**
 * Standardized evidence format (spec requirement).
 * Every evidence object MUST have pointer (non-null) and collected_at.
 */
export interface Evidence {
  pointer: string; // URL, API endpoint, or data source reference (REQUIRED)
  collected_at: string; // ISO 8601 timestamp (REQUIRED)
  source: string; // Module that collected this (e.g., 'pagespeed_v5', 'places_api_v1')
  type?: string; // Type of evidence (e.g., 'score', 'metric', 'review')
  value?: string | number; // The actual data point
  label?: string; // Human-readable label
  raw?: any; // Raw data for debugging (optional)
}

/**
 * P1-25 (Wave 3): fabricated placeholder pointer values that pass shape checks but
 * carry zero real provenance. Reject these — never fall back to them.
 */
export const PLACEHOLDER_POINTER_VALUES: ReadonlySet<string> = new Set([
  '',
  'unknown',
  'n/a',
  'na',
  'none',
  'placeholder',
  'tbd',
  'todo',
  'null',
  'undefined',
  '-',
  '--',
]);

/**
 * Known non-production loopback host that can never be a real customer-facing source
 * (unlike example.com/example.org, which are real, publicly resolvable domains that a
 * genuine fetch can legitimately target — banning those would reject truthful evidence
 * from an actual successful check, not just fabricated ones).
 */
const PLACEHOLDER_POINTER_DOMAINS = ['localhost', '127.0.0.1'];

/**
 * Returns true if `pointer` is empty, whitespace-only, a known placeholder string, a
 * fabricated example domain, or nothing more than the module/source name itself
 * (i.e. it doesn't identify a real observed source).
 */
export function isPlaceholderPointer(pointer: string | undefined | null, source?: string): boolean {
  if (pointer == null) return true;
  const trimmed = pointer.trim();
  if (trimmed.length === 0) return true;
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_POINTER_VALUES.has(lower)) return true;
  if (PLACEHOLDER_POINTER_DOMAINS.some((d) => lower.includes(d))) return true;
  if (source && lower === source.trim().toLowerCase()) return true;
  return false;
}

/** Lightweight best-effort screen for obvious secret/credential material. */
export function containsSecretLike(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const patterns = [
    /AIza[0-9A-Za-z\-_]{35}/, // Google API key
    /sk-[A-Za-z0-9]{20,}/, // OpenAI-style secret key
    /Bearer\s+[A-Za-z0-9\-_.]{10,}/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /(?:api[_-]?key|secret|token|password)\s*[=:]\s*['"]?[A-Za-z0-9\-_./+]{12,}/i,
  ];
  return patterns.some((re) => re.test(value));
}

/**
 * Validates and returns a real evidence pointer, throwing a descriptive error rather
 * than silently coercing a malformed value into an apparently-valid one (P1-25).
 */
export function assertRealPointer(pointer: string, source: string): string {
  if (isPlaceholderPointer(pointer, source)) {
    throw new Error(
      `createEvidence: pointer '${pointer}' for source '${source}' is missing, blank, or a ` +
        `known placeholder value. Provide a real source pointer (URL, provider record ID, ` +
        `DOM selector, header name, metric identifier, or similar) — never fabricate one.`
    );
  }
  if (containsSecretLike(pointer)) {
    throw new Error(
      `createEvidence: pointer for source '${source}' looks like it contains secret or ` +
        `credential material. Evidence must not carry secrets.`
    );
  }
  return pointer.trim();
}

/**
 * Create standardized evidence with required pointer and collected_at.
 * This ensures every evidence item has proper provenance tracking.
 *
 * P1-25 (Wave 3): `pointer` is required at both the type level and at runtime — there
 * is no fallback to a placeholder value. Callers with no real source pointer must not
 * call this helper at all; that is an upstream module defect, not something this
 * function should paper over.
 *
 * @param opts.pointer - URL, API endpoint, or data source reference (REQUIRED, real)
 * @param opts.source - Module that collected this (e.g., 'pagespeed_v5', 'places_api_v1')
 * @param opts.collected_at - ISO 8601 timestamp. Defaults to now, which is truthful for
 *   the common case where evidence is constructed synchronously right after collection;
 *   pass an explicit value when representing a historical observation.
 * @param opts.type - Type of evidence: 'url' | 'metric' | 'text' | 'image' | 'link'
 * @param opts.value - The actual data point
 * @param opts.label - Human-readable label
 * @param opts.raw - Raw data for debugging
 */
export function createEvidence(opts: {
  pointer: string;
  source: string;
  collected_at?: string;
  type?: 'url' | 'metric' | 'text' | 'image' | 'link' | string;
  value?: string | number;
  label?: string;
  raw?: any;
}): Evidence {
  const validTypes: EvidenceItem['type'][] = ['url', 'metric', 'text', 'image', 'link'];
  const t =
    opts.type && validTypes.includes(opts.type as EvidenceItem['type']) ? opts.type : 'metric';
  const type = (t === 'score' ? 'metric' : t) as EvidenceItem['type'];

  const pointer = assertRealPointer(opts.pointer, opts.source);

  if (typeof opts.value === 'string' && containsSecretLike(opts.value)) {
    throw new Error(
      `createEvidence: value for source '${opts.source}' looks like it contains secret or ` +
        `credential material. Evidence must not carry secrets.`
    );
  }

  // Use provided collected_at or default to now
  const collectedAt = opts.collected_at || new Date().toISOString();

  const item: Evidence = {
    pointer,
    collected_at: collectedAt,
    source: opts.source,
    type,
    value: opts.value ?? '',
    label: opts.label || opts.source,
  };

  if (opts.raw !== undefined) {
    item.raw = opts.raw;
  }

  return item;
}

export interface GBPModuleInput {
  businessName: string;
  city: string;
  /** Optional website URL for name/phone consistency checks */
  websiteUrl?: string;
}

export interface CompetitorModuleInput {
  keyword: string;
  location: string;
}

export interface CompetitorComparisonMatrix {
  business: MatchedBusinessData;
  competitors: MatchedBusinessData[];
  gaps: ComparisonGap[];
}

export interface MatchedBusinessData {
  name: string;
  rating: number;
  reviewCount: number;
  website?: string;
  websiteSpeed?: number;
  photosCount?: number;
  hasHours?: boolean;
  inLocalPack?: boolean;
  placeId?: string;
  /** Google Business category (e.g. "Dental clinic") */
  category?: string;
  /** PageSpeed performance score 0-100 */
  performanceScore?: number;
  /** PageSpeed SEO score 0-100 */
  seoScore?: number;
  /** PageSpeed accessibility score 0-100 */
  accessibilityScore?: number;
  /** Mobile performance (same as performance when strategy=mobile) */
  mobileScore?: number;
  /** Page load time in seconds (FCP or LCP) */
  loadTimeSeconds?: number;
}

export interface ComparisonGap {
  metric: 'reviews' | 'rating' | 'speed' | 'photos';
  businessValue: number;
  competitorAvg: number;
  gap: number; // business - competitor (negative means gap)
}

export interface ReputationModuleInput {
  reviews: any[];
  businessName: string;
}

export interface SocialModuleInput {
  websiteUrl: string;
  businessName: string;
}

// Result Types for DataBus
export interface PlaceDataResult {
  placeId: string;
  reviews: any[];
  rating?: number;
  userRatingCount?: number;
  address?: string;
  phone?: string;
  website?: string;
  types?: string[];
  [key: string]: any; // Allow loose typing for now until we map full Places API
}

export interface ReputationModuleResult extends ReputationModuleInput {
  skipped?: boolean;
  sentimentAnalysis?: any;
  // Add other fields returned by runReputationModule
}
