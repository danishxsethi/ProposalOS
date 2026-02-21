/**
 * TypeScript interfaces for Self-Evolving Prompts & Predictive Intelligence
 * Matches the PostgreSQL schema defined in the migration
 */

// ============================================================================
// Prompt Performance Tracking
// ============================================================================

export interface PromptPerformanceLog {
  id: string;
  timestamp: Date;
  promptVersionHash: string;
  nodeId: string;
  qualityScore: number;
  downstreamImpact: number;
  costUSD: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  experimentId?: string;
  variantId?: string;
  metadata: Record<string, any>;
}

export interface AggregateMetrics {
  avgQualityScore: number;
  avgDownstreamImpact: number;
  avgCostUSD: number;
  avgLatencyMs: number;
  totalCalls: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

// ============================================================================
// Prompt Version Control
// ============================================================================

export interface PromptVersion {
  versionHash: string;
  nodeId: string;
  promptText: string;
  createdAt: Date;
  createdBy: string;
  parentVersionHash?: string;
  branchName: string;
  changelog: string;
  isActive: boolean;
  performanceDelta?: PerformanceDelta;
}

export interface PerformanceDelta {
  qualityScoreChange: number;
  costChange: number;
  latencyChange: number;
  comparedToVersion: string;
}

export interface VersionComparison {
  version1: PromptVersion;
  version2: PromptVersion;
  textDiff: string;
  performanceDelta: PerformanceDelta;
}

// ============================================================================
// A/B Testing
// ============================================================================

export interface ABExperiment {
  id: string;
  name: string;
  nodeId: string;
  status: 'active' | 'completed' | 'paused';
  variants: ABVariant[];
  startDate: Date;
  endDate?: Date;
  winnerVariantId?: string;
  statisticalSignificance?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ABVariant {
  id: string;
  experimentId: string;
  promptVersionHash: string;
  trafficPercentage: number;
  sampleSize: number;
  avgQualityScore?: number;
  avgDownstreamImpact?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExperimentConfig {
  name: string;
  nodeId: string;
  variants: Array<{
    promptVersionHash: string;
    trafficPercentage: number;
  }>;
}

export interface WinnerResult {
  winnerVariantId: string;
  pValue: number;
  confidenceLevel: number;
  performanceDelta: number;
}

// ============================================================================
// Predictive Intelligence
// ============================================================================

export interface PredictionRecord {
  id: string;
  auditId: string;
  predictionType: 'traffic' | 'ranking' | 'competitor' | 'revenue' | 'algorithm';
  predictedValue: number;
  confidenceIntervalLower: number;
  confidenceIntervalUpper: number;
  actualValue?: number;
  observedAt?: Date;
  predictionDate: Date;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface CalibrationMetrics {
  predictionType: string;
  totalPredictions: number;
  observedPredictions: number;
  meanAbsoluteError: number;
  calibrationScore: number;
  recommendedAdjustment: number;
}

export interface AccuracyTrend {
  date: Date;
  accuracy: number;
  sampleSize: number;
}

// ============================================================================
// What-If Scenarios
// ============================================================================

export interface ScenarioRequest {
  auditId: string;
  selectedRecommendations: string[];
  baselineMetrics: Record<string, any>;
}

export interface ScenarioResult {
  id: string;
  auditId: string;
  selectedRecommendations: string[];
  projectedROI: number;
  projectedTimeline: string;
  projectedTraffic: number;
  confidenceIntervals: {
    roi: [number, number];
    traffic: [number, number];
  };
  comparisonToBaseline: {
    roiDelta: number;
    trafficDelta: number;
    timelineDelta: string;
  };
  calculationTimeMs: number;
  createdAt: Date;
}

export interface ScenarioComparison {
  scenarios: ScenarioResult[];
  bestROI: string;
  fastestTimeline: string;
  highestTraffic: string;
}

// ============================================================================
// Database Row Types (matching SQL schema exactly)
// ============================================================================

export interface PromptPerformanceLogRow {
  id: string;
  timestamp: Date;
  prompt_version_hash: string;
  node_id: string;
  quality_score: number;
  downstream_impact: number;
  cost_usd: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  experiment_id: string | null;
  variant_id: string | null;
  metadata: any;
}

export interface PromptVersionRow {
  version_hash: string;
  node_id: string;
  prompt_text: string;
  created_at: Date;
  created_by: string;
  parent_version_hash: string | null;
  branch_name: string;
  changelog: string;
  is_active: boolean;
}

export interface ABExperimentRow {
  id: string;
  name: string;
  node_id: string;
  status: string;
  start_date: Date;
  end_date: Date | null;
  winner_variant_id: string | null;
  statistical_significance: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ABVariantRow {
  id: string;
  experiment_id: string;
  prompt_version_hash: string;
  traffic_percentage: number;
  sample_size: number;
  avg_quality_score: number | null;
  avg_downstream_impact: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface PredictionRow {
  id: string;
  audit_id: string;
  prediction_type: string;
  predicted_value: number;
  confidence_interval_lower: number;
  confidence_interval_upper: number;
  actual_value: number | null;
  observed_at: Date | null;
  prediction_date: Date;
  metadata: any;
  created_at: Date;
}

export interface ScenarioRow {
  id: string;
  audit_id: string;
  selected_recommendations: any;
  projected_roi: number;
  projected_timeline: string;
  projected_traffic: number;
  confidence_intervals: any;
  comparison_to_baseline: any;
  calculation_time_ms: number;
  created_at: Date;
}
