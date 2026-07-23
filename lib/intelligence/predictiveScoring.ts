/**
 * Predictive Lead Scoring
 *
 * ML-based close probability prediction using gradient boosting on historical
 * outcome data. Provides explainability via feature importance and supports
 * model versioning with rollback.
 *
 * Requirements: 13.1–13.8
 */

import { prisma } from '@/lib/db';
import type {
  PredictiveModelConfig,
  LeadScore,
  ProspectFeatures,
  TrainingOutcome,
  ValidationResult,
  ModelPerformance,
  ComparisonResult,
  FeatureImportance,
} from './types';

// ============================================================
// Feature Engineering
// ============================================================

/** All feature names used by the model, in a fixed order */
const FEATURE_NAMES = [
  'painScore',
  'reviewCount',
  'websiteAge',
  'competitorGap',
  'emailOpens',
  'proposalViews',
  'chatInteractions',
  'businessSizeScore',
  'verticalWinRate',
  'geoWinRate',
] as const;

type FeatureName = (typeof FEATURE_NAMES)[number];

/** Map business size to a numeric score */
function businessSizeToScore(size?: 'small' | 'medium' | 'large'): number {
  if (size === 'large') return 1.0;
  if (size === 'medium') return 0.6;
  return 0.3; // small or unknown
}

/** Extract a fixed-length numeric feature vector from ProspectFeatures */
function extractFeatures(
  prospect: ProspectFeatures,
  verticalWinRate: number,
  geoWinRate: number
): number[] {
  return [
    Math.min(Math.max(prospect.painScore / 100, 0), 1),
    Math.min((prospect.reviewCount ?? 0) / 500, 1),
    Math.min((prospect.websiteAge ?? 0) / 10, 1),
    Math.min((prospect.competitorGap ?? 0) / 100, 1),
    Math.min((prospect.engagementSignals?.emailOpens ?? 0) / 10, 1),
    Math.min((prospect.engagementSignals?.proposalViews ?? 0) / 5, 1),
    Math.min((prospect.engagementSignals?.chatInteractions ?? 0) / 10, 1),
    businessSizeToScore(prospect.businessSize),
    Math.min(Math.max(verticalWinRate, 0), 1),
    Math.min(Math.max(geoWinRate, 0), 1),
  ];
}

// ============================================================
// Gradient Boosting (Decision Stump Ensemble)
// ============================================================

interface DecisionStump {
  featureIndex: number;
  threshold: number;
  leftValue: number;  // prediction when feature <= threshold
  rightValue: number; // prediction when feature > threshold
}

interface GradientBoostingModel {
  stumps: DecisionStump[];
  learningRate: number;
  featureWeights: number[]; // importance scores
  baseScore: number;
}

/** Sigmoid function mapping real values to [0, 1] */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Predict raw score (log-odds) for a feature vector */
function predictRaw(model: GradientBoostingModel, features: number[]): number {
  let score = model.baseScore;
  for (const stump of model.stumps) {
    const featureVal = features[stump.featureIndex];
    score += model.learningRate * (featureVal <= stump.threshold ? stump.leftValue : stump.rightValue);
  }
  return score;
}

/** Find the best split for a single feature across all training samples */
function findBestStump(
  features: number[][],
  residuals: number[],
  featureIndex: number
): DecisionStump {
  const values = features.map((f) => f[featureIndex]);
  const sorted = [...new Set(values)].sort((a, b) => a - b);

  let bestThreshold = sorted[0];
  let bestGain = -Infinity;
  let bestLeft = 0;
  let bestRight = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const threshold = (sorted[i] + sorted[i + 1]) / 2;
    const leftIdx = features.map((_, j) => j).filter((j) => values[j] <= threshold);
    const rightIdx = features.map((_, j) => j).filter((j) => values[j] > threshold);

    if (leftIdx.length === 0 || rightIdx.length === 0) continue;

    const leftResiduals = leftIdx.map((j) => residuals[j]);
    const rightResiduals = rightIdx.map((j) => residuals[j]);

    const leftVal = leftResiduals.reduce((s, v) => s + v, 0) / leftResiduals.length;
    const rightVal = rightResiduals.reduce((s, v) => s + v, 0) / rightResiduals.length;

    // Gain = reduction in squared residuals
    const gain =
      leftResiduals.reduce((s, v) => s + (v - leftVal) ** 2, 0) +
      rightResiduals.reduce((s, v) => s + (v - rightVal) ** 2, 0);

    if (-gain > bestGain) {
      bestGain = -gain;
      bestThreshold = threshold;
      bestLeft = leftVal;
      bestRight = rightVal;
    }
  }

  return { featureIndex, threshold: bestThreshold, leftValue: bestLeft, rightValue: bestRight };
}

/** Train a gradient boosting model on binary outcomes */
function trainGradientBoosting(
  featureMatrix: number[][],
  labels: number[], // 1 = won, 0 = lost/ghosted
  nEstimators = 50,
  learningRate = 0.1
): GradientBoostingModel {
  const n = labels.length;
  const baseScore = Math.log(
    (labels.filter((l) => l === 1).length + 1) /
    (labels.filter((l) => l === 0).length + 1)
  );

  const predictions = new Array(n).fill(baseScore);
  const stumps: DecisionStump[] = [];
  const featureUsageCounts = new Array(FEATURE_NAMES.length).fill(0);

  for (let iter = 0; iter < nEstimators; iter++) {
    // Compute pseudo-residuals (negative gradient of log-loss)
    const residuals = labels.map((y, i) => y - sigmoid(predictions[i]));

    // Find best stump across all features
    let bestStump: DecisionStump | null = null;
    let bestGain = -Infinity;

    for (let fi = 0; fi < FEATURE_NAMES.length; fi++) {
      const stump = findBestStump(featureMatrix, residuals, fi);
      // Compute gain for this stump
      const gain = featureMatrix.reduce((s, f, j) => {
        const pred = f[fi] <= stump.threshold ? stump.leftValue : stump.rightValue;
        return s - (residuals[j] - pred) ** 2;
      }, 0);

      if (gain > bestGain) {
        bestGain = gain;
        bestStump = stump;
      }
    }

    if (!bestStump) break;

    stumps.push(bestStump);
    featureUsageCounts[bestStump.featureIndex]++;

    // Update predictions
    for (let i = 0; i < n; i++) {
      const val = featureMatrix[i][bestStump.featureIndex];
      predictions[i] +=
        learningRate * (val <= bestStump.threshold ? bestStump.leftValue : bestStump.rightValue);
    }
  }

  // Normalize feature weights to sum to 1
  const totalUsage = featureUsageCounts.reduce((s, v) => s + v, 0) || 1;
  const featureWeights = featureUsageCounts.map((c) => c / totalUsage);

  return { stumps, learningRate, featureWeights, baseScore };
}

// ============================================================
// Metrics Computation
// ============================================================

function computeMetrics(
  predictions: number[],
  labels: number[],
  threshold = 0.5
): { accuracy: number; precision: number; recall: number; f1Score: number; aucRoc: number } {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i] >= threshold ? 1 : 0;
    const actual = labels[i];
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 0) tn++;
    else fn++;
  }

  const accuracy = (tp + tn) / (tp + fp + tn + fn) || 0;
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  // AUC-ROC via trapezoidal rule
  const sorted = predictions
    .map((p, i) => ({ p, label: labels[i] }))
    .sort((a, b) => b.p - a.p);

  let auc = 0;
  let prevFpr = 0;
  let prevTpr = 0;
  const totalPos = labels.filter((l) => l === 1).length;
  const totalNeg = labels.filter((l) => l === 0).length;
  let cumTp = 0, cumFp = 0;

  for (const { label } of sorted) {
    if (label === 1) cumTp++;
    else cumFp++;
    const tpr = totalPos > 0 ? cumTp / totalPos : 0;
    const fpr = totalNeg > 0 ? cumFp / totalNeg : 0;
    auc += (fpr - prevFpr) * (tpr + prevTpr) / 2;
    prevFpr = fpr;
    prevTpr = tpr;
  }

  return { accuracy, precision, recall, f1Score, aucRoc: Math.max(auc, 0) };
}

// ============================================================
// Rule-Based Baseline Scoring
// ============================================================

/** Simple rule-based scoring for comparison baseline */
function ruleBasedScore(prospect: ProspectFeatures): number {
  let score = 0;
  if (prospect.painScore >= 70) score += 0.4;
  else if (prospect.painScore >= 50) score += 0.2;
  if ((prospect.reviewCount ?? 0) >= 50) score += 0.2;
  if ((prospect.competitorGap ?? 0) >= 20) score += 0.2;
  if ((prospect.engagementSignals?.emailOpens ?? 0) >= 2) score += 0.1;
  if ((prospect.engagementSignals?.proposalViews ?? 0) >= 1) score += 0.1;
  return Math.min(score, 1);
}

// ============================================================
// Win Rate Lookups (from historical data)
// ============================================================

async function getVerticalWinRate(vertical: string): Promise<number> {
  const records = await prisma.winLossRecord.findMany({
    where: { vertical },
    select: { outcome: true },
  });
  if (records.length === 0) return 0.3; // default
  return records.filter((r) => r.outcome === 'won').length / records.length;
}

async function getGeoWinRate(geoRegion: string): Promise<number> {
  const records = await prisma.winLossRecord.findMany({
    where: { city: geoRegion },
    select: { outcome: true },
  });
  if (records.length === 0) return 0.3; // default
  return records.filter((r) => r.outcome === 'won').length / records.length;
}

// ============================================================
// Active Model Cache
// ============================================================

let _activeModelCache: { version: string; model: GradientBoostingModel } | null = null;

async function getActiveModel(): Promise<{ version: string; model: GradientBoostingModel } | null> {
  const record = await prisma.predictiveModel.findFirst({
    where: { status: 'production' },
    orderBy: { promotedAt: 'desc' },
  });

  if (!record) return null;

  if (_activeModelCache?.version === record.version) {
    return _activeModelCache;
  }

  const model = record.modelData as unknown as GradientBoostingModel;
  _activeModelCache = { version: record.version, model };
  return _activeModelCache;
}

function invalidateModelCache(): void {
  _activeModelCache = null;
}

// ============================================================
// Public API
// ============================================================

/**
 * Train a gradient boosting model on historical outcomes.
 * Returns a PredictiveModelConfig with accuracy/precision/recall/AUC-ROC metrics.
 *
 * Requirements: 13.1, 13.7
 */
export async function trainModel(outcomes: TrainingOutcome[]): Promise<PredictiveModelConfig> {
  if (outcomes.length === 0) {
    throw new Error('Cannot train model with empty outcomes');
  }

  // Gather win rates for feature engineering
  const verticals = [...new Set(outcomes.map((o) => o.features.vertical))];
  const geoRegions = [...new Set(outcomes.map((o) => o.features.geoRegion))];

  const [verticalRates, geoRates] = await Promise.all([
    Promise.all(verticals.map(async (v) => [v, await getVerticalWinRate(v)] as const)),
    Promise.all(geoRegions.map(async (g) => [g, await getGeoWinRate(g)] as const)),
  ]);

  const verticalWinRateMap = new Map(verticalRates);
  const geoWinRateMap = new Map(geoRates);

  // Build feature matrix and labels
  const featureMatrix = outcomes.map((o) =>
    extractFeatures(
      o.features,
      verticalWinRateMap.get(o.features.vertical) ?? 0.3,
      geoWinRateMap.get(o.features.geoRegion) ?? 0.3
    )
  );
  const labels = outcomes.map((o) => (o.outcome === 'won' ? 1 : 0));

  // Train model
  const gbModel = trainGradientBoosting(featureMatrix, labels);

  // Evaluate on training set (in-sample metrics)
  const trainPredictions = featureMatrix.map((f) => sigmoid(predictRaw(gbModel, f)));
  const metrics = computeMetrics(trainPredictions, labels);

  const version = `v${Date.now()}`;
  const now = new Date();

  const performance = {
    accuracy: metrics.accuracy,
    precision: metrics.precision,
    recall: metrics.recall,
    aucRoc: metrics.aucRoc,
    f1Score: metrics.f1Score,
  };

  // Persist to database
  await prisma.predictiveModel.create({
    data: {
      version,
      modelType: 'gradient_boosting',
      features: [...FEATURE_NAMES],
      status: 'validating',
      performance: performance as unknown as object,
      trainedOn: outcomes.length,
      modelData: gbModel as unknown as object,
      trainedAt: now,
    },
  });

  return {
    id: version,
    version,
    type: 'gradient_boosting',
    features: [...FEATURE_NAMES],
    performance,
    trainedOn: outcomes.length,
    trainedAt: now,
    status: 'validating',
  };
}

/**
 * Validate a model against a held-out test set.
 *
 * Requirements: 13.7
 */
export async function validateModel(
  modelId: string,
  testSet: TrainingOutcome[]
): Promise<ValidationResult> {
  const record = await prisma.predictiveModel.findUnique({
    where: { version: modelId },
  });

  if (!record) throw new Error(`Model not found: ${modelId}`);

  const gbModel = record.modelData as unknown as GradientBoostingModel;

  const verticals = [...new Set(testSet.map((o) => o.features.vertical))];
  const geoRegions = [...new Set(testSet.map((o) => o.features.geoRegion))];

  const [verticalRates, geoRates] = await Promise.all([
    Promise.all(verticals.map(async (v) => [v, await getVerticalWinRate(v)] as const)),
    Promise.all(geoRegions.map(async (g) => [g, await getGeoWinRate(g)] as const)),
  ]);

  const verticalWinRateMap = new Map(verticalRates);
  const geoWinRateMap = new Map(geoRates);

  const featureMatrix = testSet.map((o) =>
    extractFeatures(
      o.features,
      verticalWinRateMap.get(o.features.vertical) ?? 0.3,
      geoWinRateMap.get(o.features.geoRegion) ?? 0.3
    )
  );
  const labels = testSet.map((o) => (o.outcome === 'won' ? 1 : 0));
  const predictions = featureMatrix.map((f) => sigmoid(predictRaw(gbModel, f)));
  const metrics = computeMetrics(predictions, labels);

  // Update model performance with validation metrics and promote to production
  await prisma.predictiveModel.update({
    where: { version: modelId },
    data: {
      performance: metrics as unknown as object,
      status: 'production',
      promotedAt: new Date(),
    },
  });

  invalidateModelCache();

  return {
    modelId,
    accuracy: metrics.accuracy,
    precision: metrics.precision,
    recall: metrics.recall,
    aucRoc: metrics.aucRoc,
    f1Score: metrics.f1Score,
    sampleSize: testSet.length,
  };
}

/**
 * Compare ML model performance against rule-based baseline.
 * Target: 2× improvement on precision and recall.
 *
 * Requirements: 13.3
 */
export async function compareToRuleBased(
  modelId: string,
  testSet: TrainingOutcome[]
): Promise<ComparisonResult> {
  const record = await prisma.predictiveModel.findUnique({
    where: { version: modelId },
  });

  if (!record) throw new Error(`Model not found: ${modelId}`);

  const gbModel = record.modelData as unknown as GradientBoostingModel;

  const verticals = [...new Set(testSet.map((o) => o.features.vertical))];
  const geoRegions = [...new Set(testSet.map((o) => o.features.geoRegion))];

  const [verticalRates, geoRates] = await Promise.all([
    Promise.all(verticals.map(async (v) => [v, await getVerticalWinRate(v)] as const)),
    Promise.all(geoRegions.map(async (g) => [g, await getGeoWinRate(g)] as const)),
  ]);

  const verticalWinRateMap = new Map(verticalRates);
  const geoWinRateMap = new Map(geoRates);

  const featureMatrix = testSet.map((o) =>
    extractFeatures(
      o.features,
      verticalWinRateMap.get(o.features.vertical) ?? 0.3,
      geoWinRateMap.get(o.features.geoRegion) ?? 0.3
    )
  );
  const labels = testSet.map((o) => (o.outcome === 'won' ? 1 : 0));

  // ML model predictions
  const mlPredictions = featureMatrix.map((f) => sigmoid(predictRaw(gbModel, f)));
  const mlMetrics = computeMetrics(mlPredictions, labels);

  // Rule-based predictions
  const rbPredictions = testSet.map((o) => ruleBasedScore(o.features));
  const rbMetrics = computeMetrics(rbPredictions, labels);

  const improvementFactor =
    rbMetrics.precision > 0 && rbMetrics.recall > 0
      ? ((mlMetrics.precision / rbMetrics.precision) + (mlMetrics.recall / rbMetrics.recall)) / 2
      : 1;

  return {
    mlModelId: modelId,
    ruleBasedPrecision: rbMetrics.precision,
    mlPrecision: mlMetrics.precision,
    ruleBasedRecall: rbMetrics.recall,
    mlRecall: mlMetrics.recall,
    improvementFactor,
  };
}

/**
 * Score a single prospect, returning closeProbability [0-100], confidence [0-1],
 * contributing factors, and modelVersion.
 *
 * Requirements: 13.2, 13.5, 13.6
 */
export async function scoreProspect(prospect: ProspectFeatures): Promise<LeadScore> {
  const active = await getActiveModel();

  const [verticalWinRate, geoWinRate] = await Promise.all([
    getVerticalWinRate(prospect.vertical),
    getGeoWinRate(prospect.geoRegion),
  ]);

  const features = extractFeatures(prospect, verticalWinRate, geoWinRate);

  let rawScore: number;
  let modelVersion: string;
  let gbModel: GradientBoostingModel;

  if (active) {
    gbModel = active.model;
    modelVersion = active.version;
    rawScore = sigmoid(predictRaw(gbModel, features));
  } else {
    // Fallback to rule-based when no production model exists
    rawScore = ruleBasedScore(prospect);
    modelVersion = 'rule-based-fallback';
    gbModel = { stumps: [], learningRate: 0.1, featureWeights: new Array(FEATURE_NAMES.length).fill(1 / FEATURE_NAMES.length), baseScore: 0 };
  }

  const closeProbability = Math.round(Math.min(Math.max(rawScore * 100, 0), 100));

  // Confidence: based on how far the probability is from 0.5 (certainty)
  const confidence = Math.min(Math.abs(rawScore - 0.5) * 2, 1);

  // Build factor contributions using feature weights
  const factors = FEATURE_NAMES.map((name, i) => ({
    factor: name,
    contribution: gbModel.featureWeights[i] * (features[i] - 0.5) * 2,
    value: features[i],
  })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    leadId: `${prospect.vertical}-${prospect.geoRegion}-${Date.now()}`,
    closeProbability,
    confidence,
    factors,
    modelVersion,
    scoredAt: new Date(),
  };
}

/**
 * Score multiple prospects in bulk.
 *
 * Requirements: 13.6
 */
export async function batchScore(prospects: ProspectFeatures[]): Promise<LeadScore[]> {
  return Promise.all(prospects.map((p) => scoreProspect(p)));
}

/**
 * Get ranked feature importance for a model.
 *
 * Requirements: 13.5
 */
export async function getFeatureImportance(modelId: string): Promise<FeatureImportance[]> {
  const record = await prisma.predictiveModel.findUnique({
    where: { version: modelId },
  });

  if (!record) throw new Error(`Model not found: ${modelId}`);

  const gbModel = record.modelData as unknown as GradientBoostingModel;

  return FEATURE_NAMES.map((name, i) => ({
    feature: name,
    importance: gbModel.featureWeights[i],
    direction: gbModel.featureWeights[i] >= 0 ? ('positive' as const) : ('negative' as const),
  })).sort((a, b) => b.importance - a.importance);
}

/**
 * Rollback the active production model to a specific version.
 * Alerts if the target version has lower performance than current.
 *
 * Requirements: 13.8
 */
export async function rollbackModel(version: string): Promise<void> {
  const target = await prisma.predictiveModel.findUnique({
    where: { version },
  });

  if (!target) throw new Error(`Model version not found: ${version}`);

  // Check for performance degradation
  const current = await prisma.predictiveModel.findFirst({
    where: { status: 'production' },
    orderBy: { promotedAt: 'desc' },
  });

  if (current) {
    const currentPerf = current.performance as Record<string, number>;
    const targetPerf = target.performance as Record<string, number>;

    if (
      targetPerf.aucRoc !== undefined &&
      currentPerf.aucRoc !== undefined &&
      targetPerf.aucRoc < currentPerf.aucRoc * 0.9
    ) {
      // Log degradation alert — in production this would trigger a notification
      console.warn(
        `[PredictiveScoring] Rollback degradation alert: ` +
          `rolling back from AUC-ROC ${currentPerf.aucRoc.toFixed(3)} to ${targetPerf.aucRoc.toFixed(3)} ` +
          `(${(((targetPerf.aucRoc - currentPerf.aucRoc) / currentPerf.aucRoc) * 100).toFixed(1)}% change)`
      );
    }
  }

  // Deprecate all current production models
  await prisma.predictiveModel.updateMany({
    where: { status: 'production' },
    data: { status: 'deprecated', deprecatedAt: new Date() },
  });

  // Promote target version to production
  await prisma.predictiveModel.update({
    where: { version },
    data: { status: 'production', promotedAt: new Date() },
  });

  invalidateModelCache();
}

/**
 * Get performance metrics for a specific model version.
 *
 * Requirements: 13.7
 */
export async function getModelPerformance(modelId: string): Promise<ModelPerformance> {
  const record = await prisma.predictiveModel.findUnique({
    where: { version: modelId },
  });

  if (!record) throw new Error(`Model not found: ${modelId}`);

  const perf = record.performance as Record<string, number>;

  return {
    modelId,
    version: record.version,
    metrics: {
      modelId,
      accuracy: perf.accuracy ?? 0,
      precision: perf.precision ?? 0,
      recall: perf.recall ?? 0,
      aucRoc: perf.aucRoc ?? 0,
      f1Score: perf.f1Score ?? 0,
      sampleSize: record.trainedOn,
    },
    evaluatedAt: record.trainedAt,
  };
}
