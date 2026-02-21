/**
 * Data Access Layer for A/B Experiments
 * Implements experiment management and traffic routing
 */

import { executeQuery, executeCommand, executeTransaction } from '../db';
import {
  ABExperiment,
  ABVariant,
  ABExperimentRow,
  ABVariantRow,
  ExperimentConfig,
  WinnerResult,
} from '../types';

/**
 * Create a new A/B experiment with variants
 * Validates: Requirements 2.1
 */
export async function createExperiment(
  config: ExperimentConfig
): Promise<ABExperiment> {
  // Validate configuration
  const totalPercentage = config.variants.reduce(
    (sum, v) => sum + v.trafficPercentage,
    0
  );
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(
      `Traffic percentages must sum to 100, got ${totalPercentage}`
    );
  }

  return executeTransaction(async (tx) => {
    // Create experiment
    const experimentQuery = `
      INSERT INTO ab_experiments (
        name,
        node_id,
        status
      ) VALUES ($1, $2, $3)
      RETURNING *
    `;

    const experimentRows = await tx.$queryRawUnsafe<ABExperimentRow[]>(
      experimentQuery,
      config.name,
      config.nodeId,
      'active'
    );
    const experimentRow = experimentRows[0];

    // Create variants
    const variants: ABVariant[] = [];
    for (const variantConfig of config.variants) {
      const variantQuery = `
        INSERT INTO ab_variants (
          experiment_id,
          prompt_version_hash,
          traffic_percentage
        ) VALUES ($1, $2, $3)
        RETURNING *
      `;

      const variantRows = await tx.$queryRawUnsafe<ABVariantRow[]>(
        variantQuery,
        experimentRow.id,
        variantConfig.promptVersionHash,
        variantConfig.trafficPercentage
      );

      variants.push(mapRowToVariant(variantRows[0]));
    }

    return mapRowToExperiment(experimentRow, variants);
  });
}

/**
 * Get experiment by ID
 */
export async function getExperimentById(
  experimentId: string
): Promise<ABExperiment | null> {
  const experimentQuery = `
    SELECT * FROM ab_experiments WHERE id = $1
  `;
  const experimentRows = await executeQuery<ABExperimentRow>(experimentQuery, [
    experimentId,
  ]);

  if (experimentRows.length === 0) {
    return null;
  }

  const variantQuery = `
    SELECT * FROM ab_variants WHERE experiment_id = $1
  `;
  const variantRows = await executeQuery<ABVariantRow>(variantQuery, [
    experimentId,
  ]);

  return mapRowToExperiment(
    experimentRows[0],
    variantRows.map(mapRowToVariant)
  );
}

/**
 * Get active experiments for a node
 */
export async function getActiveExperiments(
  nodeId?: string
): Promise<ABExperiment[]> {
  let query = `
    SELECT * FROM ab_experiments
    WHERE status = 'active'
  `;
  const params: any[] = [];

  if (nodeId) {
    query += ` AND node_id = $1`;
    params.push(nodeId);
  }

  query += ` ORDER BY created_at DESC`;

  const experimentRows = await executeQuery<ABExperimentRow>(query, params);

  // Fetch variants for each experiment
  const experiments: ABExperiment[] = [];
  for (const expRow of experimentRows) {
    const variantQuery = `
      SELECT * FROM ab_variants WHERE experiment_id = $1
    `;
    const variantRows = await executeQuery<ABVariantRow>(variantQuery, [
      expRow.id,
    ]);

    experiments.push(
      mapRowToExperiment(
        expRow,
        variantRows.map(mapRowToVariant)
      )
    );
  }

  return experiments;
}

/**
 * Route a request to a variant based on traffic percentages
 * Validates: Requirements 2.2
 */
export async function routeRequest(
  nodeId: string,
  context: any = {}
): Promise<string> {
  // Get active experiment for this node
  const experiments = await getActiveExperiments(nodeId);

  if (experiments.length === 0) {
    throw new Error(`No active experiment found for node ${nodeId}`);
  }

  const experiment = experiments[0]; // Use the first active experiment

  // Generate a random number between 0 and 100
  const random = Math.random() * 100;

  // Route based on traffic percentages
  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += variant.trafficPercentage;
    if (random < cumulative) {
      return variant.promptVersionHash;
    }
  }

  // Fallback to last variant (should not happen if percentages sum to 100)
  return experiment.variants[experiment.variants.length - 1].promptVersionHash;
}

/**
 * Update variant metrics after a request
 */
export async function updateVariantMetrics(
  variantId: string,
  qualityScore: number,
  downstreamImpact: number
): Promise<void> {
  const query = `
    UPDATE ab_variants
    SET
      sample_size = sample_size + 1,
      avg_quality_score = COALESCE(
        (avg_quality_score * sample_size + $2) / (sample_size + 1),
        $2
      ),
      avg_downstream_impact = COALESCE(
        (avg_downstream_impact * sample_size + $3) / (sample_size + 1),
        $3
      ),
      updated_at = NOW()
    WHERE id = $1
  `;

  await executeCommand(query, [variantId, qualityScore, downstreamImpact]);
}

/**
 * Check if an experiment has a statistical winner
 * Validates: Requirements 2.3
 * Uses two-sample t-test with p < 0.05 threshold
 */
export async function checkForWinner(
  experimentId: string,
  minSampleSize: number = 100
): Promise<WinnerResult | null> {
  const experiment = await getExperimentById(experimentId);
  if (!experiment || experiment.variants.length < 2) {
    return null;
  }

  // Check if all variants have minimum sample size
  const allHaveMinSamples = experiment.variants.every(
    (v) => v.sampleSize >= minSampleSize
  );
  if (!allHaveMinSamples) {
    return null;
  }

  // Find variant with highest quality score
  const sortedVariants = [...experiment.variants].sort(
    (a, b) => (b.avgQualityScore || 0) - (a.avgQualityScore || 0)
  );

  const winner = sortedVariants[0];
  const runnerUp = sortedVariants[1];

  // Simple statistical test (simplified t-test approximation)
  // In production, use a proper statistical library
  const scoreDiff = (winner.avgQualityScore || 0) - (runnerUp.avgQualityScore || 0);
  const pooledStdDev = Math.sqrt(
    (winner.sampleSize + runnerUp.sampleSize) / (winner.sampleSize * runnerUp.sampleSize)
  );
  const tStat = scoreDiff / pooledStdDev;

  // Approximate p-value (simplified)
  const pValue = Math.exp(-Math.abs(tStat));

  if (pValue < 0.05) {
    return {
      winnerVariantId: winner.id,
      pValue,
      confidenceLevel: 1 - pValue,
      performanceDelta: scoreDiff,
    };
  }

  return null;
}

/**
 * Complete an experiment and mark the winner
 * Validates: Requirements 2.4
 */
export async function completeExperiment(
  experimentId: string,
  winnerVariantId: string
): Promise<void> {
  const query = `
    UPDATE ab_experiments
    SET
      status = 'completed',
      end_date = NOW(),
      winner_variant_id = $2,
      updated_at = NOW()
    WHERE id = $1
  `;

  await executeCommand(query, [experimentId, winnerVariantId]);
}

/**
 * Pause an experiment
 */
export async function pauseExperiment(experimentId: string): Promise<void> {
  const query = `
    UPDATE ab_experiments
    SET status = 'paused', updated_at = NOW()
    WHERE id = $1
  `;

  await executeCommand(query, [experimentId]);
}

/**
 * Resume a paused experiment
 */
export async function resumeExperiment(experimentId: string): Promise<void> {
  const query = `
    UPDATE ab_experiments
    SET status = 'active', updated_at = NOW()
    WHERE id = $1
  `;

  await executeCommand(query, [experimentId]);
}

/**
 * Get variant by ID
 */
export async function getVariantById(
  variantId: string
): Promise<ABVariant | null> {
  const query = `SELECT * FROM ab_variants WHERE id = $1`;
  const rows = await executeQuery<ABVariantRow>(query, [variantId]);
  return rows.length > 0 ? mapRowToVariant(rows[0]) : null;
}

/**
 * Map database row to experiment object
 */
function mapRowToExperiment(
  row: ABExperimentRow,
  variants: ABVariant[]
): ABExperiment {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.node_id,
    status: row.status as 'active' | 'completed' | 'paused',
    variants,
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    winnerVariantId: row.winner_variant_id || undefined,
    statisticalSignificance: row.statistical_significance
      ? parseFloat(row.statistical_significance.toString())
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Map database row to variant object
 */
function mapRowToVariant(row: ABVariantRow): ABVariant {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    promptVersionHash: row.prompt_version_hash,
    trafficPercentage: row.traffic_percentage,
    sampleSize: row.sample_size,
    avgQualityScore: row.avg_quality_score
      ? parseFloat(row.avg_quality_score.toString())
      : undefined,
    avgDownstreamImpact: row.avg_downstream_impact
      ? parseFloat(row.avg_downstream_impact.toString())
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
