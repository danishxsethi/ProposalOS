/**
 * Data Access Layer for A/B Experiments
 * Implements experiment management and traffic routing
 */

import { prisma } from '@/lib/prisma';
import {
  getTenantRuntimeContextFromStore,
  runWithPrismaTransactionContext,
} from '@/lib/tenant/context';

import {
  ABExperiment,
  ABExperimentRow,
  ABVariant,
  ABVariantRow,
  ExperimentConfig,
  WinnerResult,
} from '../types';

import type { Prisma } from '@prisma/client';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BYPASS_TENANT_SENTINEL = '00000000-0000-0000-0000-000000000000';

function assertTenantContext(operationName: string, tenantId: string | null): string {
  if (!tenantId) {
    throw new Error(`Tenant context required for ${operationName}: missing tenant context`);
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Tenant context required for ${operationName}: invalid tenant context`);
  }

  return tenantId;
}

async function applyRawRlsContext(
  tx: Prisma.TransactionClient,
  operationName: string,
  tenantIdOverride?: string
) {
  const { tenantId, bypassRls } = getTenantRuntimeContextFromStore();

  if (bypassRls) {
    await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${BYPASS_TENANT_SENTINEL}, true)`;
    await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'true', true)`;
    return;
  }

  const effectiveTenantId = assertTenantContext(operationName, tenantIdOverride ?? tenantId);

  await tx.$queryRaw`SELECT set_config('app.bypass_rls', 'false', true)`;
  await tx.$queryRaw`SELECT set_config('app.current_tenant_id', ${effectiveTenantId}, true)`;
}

async function withRawTransaction<T>(
  operationName: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  tenantIdOverride?: string
): Promise<T> {
  const { currentTx } = getTenantRuntimeContextFromStore();

  if (currentTx) {
    await applyRawRlsContext(currentTx, operationName, tenantIdOverride);
    return callback(currentTx);
  }

  return prisma.$transaction((tx) =>
    runWithPrismaTransactionContext(tx, async () => {
      await applyRawRlsContext(tx, operationName, tenantIdOverride);
      return callback(tx);
    })
  );
}

async function runQuery<T>(
  operationName: string,
  query: string,
  params: unknown[] = []
): Promise<T[]> {
  return withRawTransaction(operationName, (tx) => tx.$queryRawUnsafe<T[]>(query, ...params));
}

async function runCommand(
  operationName: string,
  command: string,
  params: unknown[] = []
): Promise<number> {
  return withRawTransaction(operationName, (tx) => tx.$executeRawUnsafe(command, ...params));
}

function requireFirstRow<T>(rows: T[], operationName: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`${operationName} returned no rows`);
  }
  return row;
}

/**
 * Create a new A/B experiment with variants
 * Validates: Requirements 2.1
 */
export async function createExperiment(config: ExperimentConfig): Promise<ABExperiment> {
  const totalPercentage = config.variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Traffic percentages must sum to 100, got ${totalPercentage}`);
  }

  const tenantId = assertTenantContext('ABExperiment.create', config.tenantId ?? null);

  return withRawTransaction(
    'ABExperiment.create',
    async (tx) => {
      const experimentQuery = `
        INSERT INTO "ABExperiment" (
          "name",
          "nodeId",
          "tenantId",
          "status"
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const experimentRows = await tx.$queryRawUnsafe<ABExperimentRow[]>(
        experimentQuery,
        config.name,
        config.nodeId,
        tenantId,
        'active'
      );
      const experimentRow = requireFirstRow(experimentRows, 'ABExperiment.create');

      const variants: ABVariant[] = [];
      for (const variantConfig of config.variants) {
        const variantQuery = `
          INSERT INTO "ABVariant" (
            "experimentId",
            "promptVersionHash",
            "tenantId",
            "trafficPercentage"
          ) VALUES ($1, $2, $3, $4)
          RETURNING *
        `;

        const variantRows = await tx.$queryRawUnsafe<ABVariantRow[]>(
          variantQuery,
          experimentRow.id,
          variantConfig.promptVersionHash,
          experimentRow.tenantId,
          variantConfig.trafficPercentage
        );

        variants.push(mapRowToVariant(requireFirstRow(variantRows, 'ABVariant.create')));
      }

      return mapRowToExperiment(experimentRow, variants);
    },
    tenantId
  );
}

/**
 * Get experiment by ID
 */
export async function getExperimentById(experimentId: string): Promise<ABExperiment | null> {
  const experimentQuery = `
    SELECT * FROM "ABExperiment" WHERE "id" = $1
  `;
  const experimentRows = await runQuery<ABExperimentRow>('ABExperiment.getById', experimentQuery, [
    experimentId,
  ]);

  if (experimentRows.length === 0) {
    return null;
  }

  const variantQuery = `
    SELECT * FROM "ABVariant" WHERE "experimentId" = $1
  `;
  const variantRows = await runQuery<ABVariantRow>('ABVariant.listByExperiment', variantQuery, [
    experimentId,
  ]);

  return mapRowToExperiment(
    requireFirstRow(experimentRows, 'ABExperiment.getById'),
    variantRows.map(mapRowToVariant)
  );
}

/**
 * Get active experiments for a node
 */
export async function getActiveExperiments(nodeId?: string): Promise<ABExperiment[]> {
  let query = `
    SELECT * FROM "ABExperiment"
    WHERE "status" = 'active'
  `;
  const params: unknown[] = [];

  if (nodeId) {
    query += ` AND "nodeId" = $1`;
    params.push(nodeId);
  }

  query += ` ORDER BY "createdAt" DESC`;

  const experimentRows = await runQuery<ABExperimentRow>('ABExperiment.listActive', query, params);

  const experiments: ABExperiment[] = [];
  for (const expRow of experimentRows) {
    const variantQuery = `
      SELECT * FROM "ABVariant" WHERE "experimentId" = $1
    `;
    const variantRows = await runQuery<ABVariantRow>('ABVariant.listByExperiment', variantQuery, [
      expRow.id,
    ]);

    experiments.push(mapRowToExperiment(expRow, variantRows.map(mapRowToVariant)));
  }

  return experiments;
}

/**
 * Route a request to a variant based on traffic percentages
 * Validates: Requirements 2.2
 */
export async function routeRequest(nodeId: string, _context: any = {}): Promise<string> {
  const experiments = await getActiveExperiments(nodeId);

  if (experiments.length === 0) {
    throw new Error(`No active experiment found for node ${nodeId}`);
  }

  const experiment = experiments[0];
  if (!experiment) {
    throw new Error(`No active experiment found for node ${nodeId}`);
  }
  const random = Math.random() * 100;

  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += variant.trafficPercentage;
    if (random < cumulative) {
      return variant.promptVersionHash;
    }
  }

  const fallbackVariant = experiment.variants[experiment.variants.length - 1];
  if (!fallbackVariant) {
    throw new Error(`No active experiment found for node ${nodeId}`);
  }

  return fallbackVariant.promptVersionHash;
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
    UPDATE "ABVariant"
    SET
      "sampleSize" = "sampleSize" + 1,
      "avgQualityScore" = COALESCE(
        ("avgQualityScore" * "sampleSize" + $2) / ("sampleSize" + 1),
        $2
      ),
      "avgDownstreamImpact" = COALESCE(
        ("avgDownstreamImpact" * "sampleSize" + $3) / ("sampleSize" + 1),
        $3
      ),
      "updatedAt" = NOW()
    WHERE "id" = $1
  `;

  await runCommand('ABVariant.updateMetrics', query, [variantId, qualityScore, downstreamImpact]);
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

  const allHaveMinSamples = experiment.variants.every((v) => v.sampleSize >= minSampleSize);
  if (!allHaveMinSamples) {
    return null;
  }

  const sortedVariants = [...experiment.variants].sort(
    (a, b) => (b.avgQualityScore || 0) - (a.avgQualityScore || 0)
  );

  const winner = sortedVariants[0];
  const runnerUp = sortedVariants[1];
  if (!winner || !runnerUp) {
    return null;
  }

  const scoreDiff = (winner.avgQualityScore || 0) - (runnerUp.avgQualityScore || 0);
  const pooledStdDev = Math.sqrt(
    (winner.sampleSize + runnerUp.sampleSize) / (winner.sampleSize * runnerUp.sampleSize)
  );
  const tStat = scoreDiff / pooledStdDev;
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
    UPDATE "ABExperiment"
    SET
      "status" = 'completed',
      "endDate" = NOW(),
      "winnerVariantId" = $2,
      "updatedAt" = NOW()
    WHERE "id" = $1
  `;

  await runCommand('ABExperiment.complete', query, [experimentId, winnerVariantId]);
}

/**
 * Pause an experiment
 */
export async function pauseExperiment(experimentId: string): Promise<void> {
  const query = `
    UPDATE "ABExperiment"
    SET "status" = 'paused', "updatedAt" = NOW()
    WHERE "id" = $1
  `;

  await runCommand('ABExperiment.pause', query, [experimentId]);
}

/**
 * Resume a paused experiment
 */
export async function resumeExperiment(experimentId: string): Promise<void> {
  const query = `
    UPDATE "ABExperiment"
    SET "status" = 'active', "updatedAt" = NOW()
    WHERE "id" = $1
  `;

  await runCommand('ABExperiment.resume', query, [experimentId]);
}

/**
 * Get variant by ID
 */
export async function getVariantById(variantId: string): Promise<ABVariant | null> {
  const query = `SELECT * FROM "ABVariant" WHERE "id" = $1`;
  const rows = await runQuery<ABVariantRow>('ABVariant.getById', query, [variantId]);
  return rows.length > 0 ? mapRowToVariant(requireFirstRow(rows, 'ABVariant.getById')) : null;
}

function mapRowToExperiment(row: ABExperimentRow, variants: ABVariant[]): ABExperiment {
  return {
    id: row.id,
    name: row.name,
    nodeId: row.nodeId,
    tenantId: row.tenantId,
    status: row.status as 'active' | 'completed' | 'paused',
    variants,
    startDate: row.startDate,
    endDate: row.endDate || undefined,
    winnerVariantId: row.winnerVariantId || undefined,
    statisticalSignificance: row.statisticalSignificance
      ? parseFloat(row.statisticalSignificance.toString())
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRowToVariant(row: ABVariantRow): ABVariant {
  return {
    id: row.id,
    experimentId: row.experimentId,
    promptVersionHash: row.promptVersionHash,
    tenantId: row.tenantId,
    trafficPercentage: row.trafficPercentage,
    sampleSize: row.sampleSize,
    avgQualityScore: row.avgQualityScore ? parseFloat(row.avgQualityScore.toString()) : undefined,
    avgDownstreamImpact: row.avgDownstreamImpact
      ? parseFloat(row.avgDownstreamImpact.toString())
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
