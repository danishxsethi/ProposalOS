/**
 * Core TypeScript interfaces and types for Deep Localization + Cross-Tenant Intelligence
 */

// ============================================================================
// Locale Detection Types
// ============================================================================

export interface LocaleDetectionResult {
  detectedLocale: string;
  detectionMethod: 'tld' | 'hreflang' | 'gbp' | 'ip_geolocation' | 'manual_override' | 'default';
  confidence: number; // 0-1
  fallbackChain: string[]; // Locales tried in order
}

export interface LocaleConfig {
  locale: string;
  language: string;
  primarySearchEngine: 'google' | 'yandex' | 'baidu' | 'naver';
  currency: string;
  regulations: string[]; // e.g., ['GDPR', 'PIPEDA']
  tone: 'formal' | 'casual' | 'professional';
  benchmarkCohorts: string[];
}

export interface DetectionContext {
  domain?: string;
  htmlContent?: string;
  gbpLocation?: string;
  ipAddress?: string;
  manualOverride?: string;
}

// ============================================================================
// Localization Engine Types
// ============================================================================

export interface LocalizationContext {
  locale: string;
  localeConfig: LocaleConfig;
  auditContext: any;
  targetNodeId: string;
}

export interface LocalizedPrompt {
  id?: string;
  nodeId: string;
  locale: string;
  promptText: string;
  culturalContext: string;
  thinkingBudget: number; // 4,096 tokens
  createdAt: Date;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  nativeSpeakerReview?: string;
}

export interface LocalizationDimensions {
  language: string;
  searchEngine: string;
  benchmarks: string;
  competitors: string;
  regulations: string[];
  currency: string;
  tone: string;
}

export interface LocalizedFinding {
  originalFinding: any;
  localizedText: string;
  locale: string;
  culturalContext: string;
}

export interface LocalizedRecommendation {
  originalRecommendation: any;
  localizedText: string;
  locale: string;
  culturalContext: string;
}

export interface LocalizedBenchmark {
  metric: string;
  value: number;
  percentile: number;
  locale: string;
}

export interface RegulatoryFlag {
  recommendationId: string;
  regulation: string;
  severity: 'warning' | 'error';
  message: string;
  complianceRequirements: string[];
  suggestedAlternatives: string[];
}

export interface LocalizedResults {
  findings: LocalizedFinding[];
  recommendations: LocalizedRecommendation[];
  benchmarks: LocalizedBenchmark[];
  regulatoryFlags: RegulatoryFlag[];
}

export interface FormattedMetrics {
  [key: string]: string;
}

// ============================================================================
// Anonymization Types
// ============================================================================

export interface RawAuditMetrics {
  clientId: string;
  clientName: string;
  domain: string;
  contactInfo: string;
  auditResults: any;
  timestamp: Date;
}

export interface AnonymizedAuditMetrics {
  anonymousId: string; // Hashed, non-reversible
  industry: string;
  businessSize: string;
  locale: string;
  metrics: Map<string, number>;
  timestamp: Date;
  differentialPrivacyNoise: number;
}

export interface AnonymizationConfig {
  fieldsToRemove: string[];
  fieldsToGeneralize: Map<string, GeneralizationRule>;
  differentialPrivacyEpsilon: number;
  kAnonymityMinimum: number;
}

export interface GeneralizationRule {
  field: string;
  generalizationType: 'suppress' | 'aggregate' | 'hash' | 'round';
  parameters?: any;
}

// ============================================================================
// Benchmark Types
// ============================================================================

export interface AnonymizedMetric {
  id?: string;
  industry: string;
  businessSize: 'small' | 'medium' | 'large';
  locale: string;
  metricType: string;
  value: number;
  timestamp: Date;
  cohortId?: string;
  differentialPrivacyNoise?: number;
}

export interface BenchmarkCohort {
  id?: string;
  industry: string;
  businessSize: string;
  locale: string;
  recordCount: number;
  metrics: Map<string, BenchmarkMetric>;
  kAnonymity: number;
  lastUpdated: Date;
}

export interface BenchmarkMetric {
  name: string;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p95: number;
  sampleSize: number;
}

export interface BenchmarkQuery {
  industry: string;
  businessSize?: string;
  locale: string;
  metricTypes?: string[];
}

export interface CohortStats {
  recordCount: number;
  kAnonymity: number;
  metrics: BenchmarkMetric[];
  confidence: number;
}

// ============================================================================
// Pattern Discovery Types
// ============================================================================

export interface Pattern {
  id?: string;
  description: string;
  affectedPlatforms: string[]; // e.g., ['WordPress', 'Shopify']
  affectedPlugins?: string[]; // e.g., ['Yoast', 'Rank Math']
  frequency: number; // Number of audits where pattern observed
  industries: string[];
  locales: string[];
  recommendedFixes: string[];
  confidenceScore: number; // 0-1, based on frequency
  discoveredAt: Date;
  lastObservedAt: Date;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface PatternQuery {
  platform?: string;
  plugin?: string;
  industry?: string;
  locale?: string;
  minFrequency?: number;
}

export interface PatternStats {
  totalPatterns: number;
  localesSupported: string[];
  pendingApprovals: number;
  approvedVariants: number;
}

// ============================================================================
// Recommendation Effectiveness Types
// ============================================================================

export interface RecommendationImplementation {
  id?: string;
  recommendationId: string;
  recommendationType: string;
  industry: string;
  locale: string;
  predictedImpact: {
    trafficChange: number;
    rankingChange: number;
    conversionChange: number;
  };
  implementedAt: Date;
}

export interface EffectivenessRecord {
  id?: string;
  implementationId: string;
  reAuditDate: Date;
  actualImpact: {
    trafficChange: number;
    rankingChange: number;
    conversionChange: number;
  };
  accuracy: number; // 0-1, how close actual was to predicted
  confidenceLevel: number;
}

export interface EffectivenessStats {
  recommendationType: string;
  industry: string;
  locale: string;
  sampleSize: number;
  averageAccuracy: number;
  averageActualImpact: number;
  confidenceInterval: [number, number];
}

export interface AccuracyMetrics {
  overallAccuracy: number;
  byRecommendationType: Map<string, number>;
  byIndustry: Map<string, number>;
  byLocale: Map<string, number>;
  trend: 'improving' | 'stable' | 'declining';
}

// ============================================================================
// Intelligence API Types
// ============================================================================

export interface IntelligenceQuery {
  queryType: 'benchmarks' | 'patterns' | 'effectiveness';
  filters: Map<string, any>;
  timestamp: Date;
  requesterId: string;
}

export interface IntelligenceResponse {
  data: any;
  metadata: {
    sampleSize: number;
    confidence: number;
    kAnonymity: number;
    lastUpdated: Date;
  };
  privacyNotice: string;
}

export interface APIAuditLog {
  id?: string;
  queryType: string;
  filters: any;
  requesterId: string;
  responseSampleSize?: number;
  responseKAnonymity?: number;
  complianceReview?: string;
  timestamp: Date;
}

// ============================================================================
// Regulatory Compliance Types
// ============================================================================

export interface RegulatoryRule {
  id?: string;
  regulation: string; // e.g., 'GDPR', 'PIPEDA', 'Privacy Act'
  locale: string;
  applicableRecommendationTypes: string[];
  complianceRequirements: string[];
  suggestedAlternatives: string[];
}

export interface RegulatoryConfig {
  locale: string;
  applicableRegulations: RegulatoryRule[];
}

export interface ComplianceReport {
  locale: string;
  totalRecommendations: number;
  flaggedRecommendations: number;
  flags: RegulatoryFlag[];
  complianceScore: number;
}

// ============================================================================
// Prompt Library Types
// ============================================================================

export interface PromptLibraryEntry {
  nodeId: string;
  variants: Map<string, LocalizedPrompt>; // locale → LocalizedPrompt
  basePrompt: string;
  createdAt: Date;
  lastUpdated: Date;
  versionHistory: LocalizedPrompt[];
}

export interface PromptLibraryStats {
  totalNodes: number;
  localesSupported: string[];
  pendingApprovals: number;
  approvedVariants: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AuditLog {
  timestamp: Date;
  operation: string;
  details: any;
}

// ============================================================================
// Time Range Types
// ============================================================================

export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

export interface TrendData {
  timestamps: Date[];
  values: number[];
  trend: 'increasing' | 'stable' | 'decreasing';
}
