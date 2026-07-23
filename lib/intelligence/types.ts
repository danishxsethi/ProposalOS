/**
 * Intelligence types for Sprint 5-6: Cross-Tenant Learning, Predictive Scoring,
 * Anomaly Detection, Prompt Engineering, and Multi-Model Orchestration
 */

import type { DateRange } from '../pipeline/types';

// ============================================================
// Cross-Tenant Learning
// ============================================================

export type PatternType = 'win_rate' | 'finding_effectiveness' | 'pricing' | 'email_template';

export interface AnonymizedPatternData {
  winRate?: number;
  effectiveFindingTypes?: string[];
  optimalPriceRange?: { min: number; max: number };
  bestEmailPatterns?: string[];
}

export interface AnonymizedPattern {
  id: string;
  vertical: string;
  geoRegion: string;
  patternType: PatternType;
  data: AnonymizedPatternData;
  sampleSize: number;
  confidence: number;
  lastUpdated: Date;
  modelVersion: string;
}

export interface AnonymizedOutcome {
  vertical: string;
  geoRegion: string;
  painScore: number;
  outcome: 'won' | 'lost' | 'ghosted';
  tierChosen?: string;
  dealValue?: number;
  findingTypes: string[];
  emailTemplateId?: string;
  // NO tenant ID, business name, or contact info
}

export interface PatternFilters {
  vertical?: string;
  geoRegion?: string;
  patternType?: PatternType;
  minSampleSize?: number;
  minConfidence?: number;
}

export interface LiftMetrics {
  withSharedLearning: number;
  withoutSharedLearning: number;
  liftPercent: number;
}

// ============================================================
// Vertical Specialization Engine
// ============================================================

export interface VerticalPlaybookConfig {
  effectiveFindings: { type: string; weight: number }[];
  emailTemplates: { id: string; winRate: number }[];
  pricingStrategy: {
    essentials: { min: number; max: number };
    growth: { min: number; max: number };
    premium: { min: number; max: number };
  };
  commonObjections: { objection: string; response: string }[];
  industryTerms: string[];
}

export interface VerticalPlaybookPerformance {
  winRate: number;
  averageDealSize: number;
  timeToClose: number; // days
  sampleSize: number;
}

export interface VerticalPlaybook {
  id: string;
  vertical: string;
  status: 'emerging' | 'testing' | 'production' | 'deprecated';
  config: VerticalPlaybookConfig;
  performance: VerticalPlaybookPerformance;
  createdAt: Date;
  lastOptimized: Date;
}

export interface EmergingVertical {
  vertical: string;
  prospectCount: number;
  winRate: number;
  averagePainScore: number;
  detectedAt: Date;
}

export interface VerticalOutcome {
  vertical: string;
  outcome: 'won' | 'lost' | 'ghosted';
  findingTypes: string[];
  emailTemplateId?: string;
  tierChosen?: string;
  dealValue?: number;
  timeToClose?: number;
}

export interface ABTest {
  id: string;
  controlId: string;
  testId: string;
  trafficSplit: number;
  minSampleSize: number;
  significanceThreshold: number;
  improvementThreshold: number;
  status: 'running' | 'completed' | 'stopped';
  startedAt: Date;
  completedAt?: Date;
}

export interface ABTestResult {
  testId: string;
  winner: 'control' | 'test' | 'inconclusive';
  controlMetric: number;
  testMetric: number;
  improvement: number;
  pValue: number;
  sampleSize: number;
  significant: boolean;
}

export interface PlaybookFilters {
  vertical?: string;
  status?: VerticalPlaybook['status'];
  minWinRate?: number;
}

// ============================================================
// Predictive Lead Scoring
// ============================================================

export interface PredictiveModelConfig {
  id: string;
  version: string;
  type: 'gradient_boosting' | 'neural_network' | 'ensemble';
  features: string[];
  performance: {
    accuracy: number;
    precision: number;
    recall: number;
    aucRoc: number;
    f1Score: number;
  };
  trainedOn: number; // sample size
  trainedAt: Date;
  status: 'training' | 'validating' | 'production' | 'deprecated';
}

export interface LeadScore {
  leadId: string;
  closeProbability: number; // 0-100
  confidence: number; // 0-1
  factors: {
    factor: string;
    contribution: number; // positive or negative
    value: unknown;
  }[];
  modelVersion: string;
  scoredAt: Date;
}

export interface ProspectFeatures {
  vertical: string;
  painScore: number;
  geoRegion: string;
  businessSize?: 'small' | 'medium' | 'large';
  websiteAge?: number;
  reviewCount?: number;
  competitorGap?: number;
  engagementSignals?: {
    emailOpens: number;
    proposalViews: number;
    chatInteractions: number;
  };
}

export interface TrainingOutcome {
  features: ProspectFeatures;
  outcome: 'won' | 'lost' | 'ghosted';
  dealValue?: number;
  timeToClose?: number;
}

export interface ValidationResult {
  modelId: string;
  accuracy: number;
  precision: number;
  recall: number;
  aucRoc: number;
  f1Score: number;
  sampleSize: number;
}

export interface ModelPerformance {
  modelId: string;
  version: string;
  metrics: ValidationResult;
  evaluatedAt: Date;
}

export interface ComparisonResult {
  mlModelId: string;
  ruleBasedPrecision: number;
  mlPrecision: number;
  ruleBasedRecall: number;
  mlRecall: number;
  improvementFactor: number; // target: 2x
}

export interface FeatureImportance {
  feature: string;
  importance: number; // 0-1
  direction: 'positive' | 'negative';
}

// ============================================================
// Anomaly Detection & Self-Healing
// ============================================================

export type RemediationAction =
  | { type: 'rotate_domains'; config: { minHealthyDomains: number } }
  | { type: 'adjust_pricing'; config: { adjustmentPercent: number } }
  | { type: 'switch_api_provider'; config: { fallbackProvider: string } }
  | { type: 'pause_stage'; config: { stage: string; durationMinutes: number } }
  | { type: 'alert_only'; config: { channels: string[] } };

export interface AnomalyConfig {
  metric: string;
  baseline: number;
  threshold: number; // standard deviations
  windowMinutes: number;
  remediationAction?: RemediationAction;
}

export interface RemediationAttempt {
  id: string;
  anomalyId: string;
  action: RemediationAction;
  outcome: 'success' | 'failure' | 'pending';
  notes?: string;
  attemptedAt: Date;
  completedAt?: Date;
}

export interface DetectedAnomaly {
  id: string;
  metric: string;
  currentValue: number;
  baselineValue: number;
  deviation: number; // standard deviations
  detectedAt: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'remediating' | 'resolved' | 'escalated';
  remediationAttempts: RemediationAttempt[];
}

export interface RemediationResult {
  success: boolean;
  action: RemediationAction;
  notes?: string;
  completedAt: Date;
}

export interface RemediationFilters {
  metric?: string;
  outcome?: 'success' | 'failure';
  dateRange?: DateRange;
}

export interface SystemHealthReport {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  metrics: {
    name: string;
    value: number;
    baseline: number;
    status: 'normal' | 'warning' | 'critical';
  }[];
  activeAnomalies: DetectedAnomaly[];
  generatedAt: Date;
}

// ============================================================
// Autonomous Prompt Engineering
// ============================================================

export type PromptTaskType =
  | 'email_generation'
  | 'proposal_writing'
  | 'objection_handling'
  | 'diagnosis';

export interface PromptVariantPerformance {
  sampleSize: number;
  successRate: number;
  qualityScore: number;
  costPerCall: number;
}

export interface PromptVariant {
  id: string;
  basePromptId: string;
  version: number;
  content: string;
  taskType: PromptTaskType;
  status: 'draft' | 'testing' | 'production' | 'deprecated';
  performance: PromptVariantPerformance;
  createdAt: Date;
  createdBy: 'human' | 'autonomous';
}

export interface ABTestConfig {
  controlVariantId: string;
  testVariantId: string;
  trafficSplit: number; // 0-1
  minSampleSize: number;
  significanceThreshold: number; // p-value
  improvementThreshold: number; // minimum improvement to promote
}

export interface GuardrailValidation {
  passed: boolean;
  checks: {
    noHarmfulContent: boolean;
    noMisleadingClaims: boolean;
    complianceCheck: boolean;
    brandSafetyCheck: boolean;
  };
  flaggedIssues: string[];
}

export interface PromptPerformanceReport {
  period: DateRange;
  totalVariantsTested: number;
  promoted: number;
  rolledBack: number;
  averageImprovementPercent: number;
  topPerformingVariants: PromptVariant[];
  generatedAt: Date;
}

// ============================================================
// Multi-Model Orchestration
// ============================================================

export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'meta';
export type ModelId =
  | 'gpt-4o'
  | 'gpt-4-turbo'
  | 'claude-3-opus'
  | 'claude-3-sonnet'
  | 'gemini-pro'
  | 'llama-3';

export interface ModelBenchmarkMetrics {
  quality: number; // 0-100
  latencyP50: number; // ms
  latencyP95: number; // ms
  costPer1kTokens: number; // cents
  errorRate: number;
}

export interface ModelBenchmark {
  modelId: ModelId;
  taskType: string;
  metrics: ModelBenchmarkMetrics;
  lastBenchmarked: Date;
  sampleSize: number;
}

export interface ModelRequirements {
  minQuality: number;
  maxLatency: number;
  maxCost: number;
  preferredProvider?: LLMProvider;
}

export interface RoutingDecision {
  selectedModel: ModelId;
  reason: string;
  fallbackModels: ModelId[];
  estimatedCost: number;
  estimatedLatency: number;
}

export interface LLMTask {
  taskType: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  metadata?: Record<string, unknown>;
}

export interface LLMResponse {
  modelId: ModelId;
  content: string;
  tokensUsed: number;
  costCents: number;
  latencyMs: number;
  finishReason: string;
}

export interface BenchmarkFilters {
  taskType?: string;
  modelId?: ModelId;
  minSampleSize?: number;
}

export interface TestCase {
  input: string;
  expectedOutput?: string;
  evaluationCriteria?: string[];
}

export interface CostAnalytics {
  period: DateRange;
  totalCostCents: number;
  costByModel: Record<ModelId, number>;
  costByTaskType: Record<string, number>;
  averageCostPerAuditCents: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}
