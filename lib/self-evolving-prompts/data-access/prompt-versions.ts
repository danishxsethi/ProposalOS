/**
 * Data Access Layer for Prompt Versions
 * Implements version control operations
 */

import { createHash } from 'crypto';

import { getTenantRuntimeContextFromStore } from '@/lib/tenant/context';

import { executeCommand, executeQuery } from '../db';
import { PerformanceDelta, PromptVersion, PromptVersionRow, VersionComparison } from '../types';
import { getAggregateMetrics } from './prompt-performance';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROMPT_VERSION_SELECT = `
  SELECT
    "versionHash" AS version_hash,
    "nodeId" AS node_id,
    "promptText" AS prompt_text,
    "createdAt" AS created_at,
    "createdBy" AS created_by,
    "parentVersionHash" AS parent_version_hash,
    "branchName" AS branch_name,
    changelog,
    "isActive" AS is_active,
    "tenantId" AS tenant_id
  FROM "PromptVersion"
`;

function requireFirstRow<T>(rows: T[], operationName: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(`${operationName} returned no rows`);
  }

  return row;
}

function getOptionalTenantId(operationName: string): string | null {
  const { tenantId } = getTenantRuntimeContextFromStore();

  if (!tenantId) {
    return null;
  }

  if (!UUID_PATTERN.test(tenantId)) {
    throw new Error(`Tenant context required for ${operationName}: invalid tenant context`);
  }

  return tenantId;
}

function buildAccessibleTenantScope(
  operationName: string,
  parameterIndex: number
): {
  tenantId: string | null;
  clause: string;
  params: unknown[];
  requireTenant: boolean;
} {
  const tenantId = getOptionalTenantId(operationName);

  if (!tenantId) {
    return {
      tenantId: null,
      clause: `"tenantId" IS NULL`,
      params: [],
      requireTenant: false,
    };
  }

  return {
    tenantId,
    clause: `("tenantId" = $${parameterIndex} OR "tenantId" IS NULL)`,
    params: [tenantId],
    requireTenant: true,
  };
}

function buildExactTenantScope(
  parameterIndex: number,
  tenantId: string | null | undefined
): { clause: string; params: unknown[]; requireTenant: boolean } {
  if (!tenantId) {
    return {
      clause: `"tenantId" IS NULL`,
      params: [],
      requireTenant: false,
    };
  }

  return {
    clause: `"tenantId" = $${parameterIndex}`,
    params: [tenantId],
    requireTenant: true,
  };
}

/**
 * Generate version hash from node ID, prompt text, and timestamp
 * Validates: Requirements 4.1
 */
export function generateVersionHash(
  nodeId: string,
  promptText: string,
  timestamp: Date = new Date()
): string {
  const content = `${nodeId}:${promptText}:${timestamp.toISOString()}`;
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Create a new prompt version
 * Validates: Requirements 4.1, 4.2
 */
export async function createVersion(
  nodeId: string,
  promptText: string,
  createdBy: string,
  changelog: string,
  parentVersionHash?: string,
  branchName: string = 'main'
): Promise<PromptVersion> {
  if (!changelog || changelog.trim().length === 0) {
    throw new Error('Changelog cannot be empty');
  }

  const versionHash = generateVersionHash(nodeId, promptText);
  const tenantId = getOptionalTenantId('PromptVersion.create');
  const query = `
    INSERT INTO "PromptVersion" (
      "versionHash",
      "nodeId",
      "promptText",
      "createdBy",
      "parentVersionHash",
      "branchName",
      changelog,
      "isActive",
      "tenantId"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING
      "versionHash" AS version_hash,
      "nodeId" AS node_id,
      "promptText" AS prompt_text,
      "createdAt" AS created_at,
      "createdBy" AS created_by,
      "parentVersionHash" AS parent_version_hash,
      "branchName" AS branch_name,
      changelog,
      "isActive" AS is_active,
      "tenantId" AS tenant_id
  `;

  const rows = await executeQuery<PromptVersionRow>(
    query,
    [
      versionHash,
      nodeId,
      promptText,
      createdBy,
      parentVersionHash || null,
      branchName,
      changelog,
      false,
      tenantId,
    ],
    {
      operationName: 'PromptVersion.create',
      requireTenant: tenantId !== null,
    }
  );
  return mapRowToVersion(requireFirstRow(rows, 'PromptVersion.create'));
}

/**
 * Get version by hash
 */
export async function getVersionByHash(versionHash: string): Promise<PromptVersion | null> {
  const scope = buildAccessibleTenantScope('PromptVersion.getByHash', 2);
  const query = `
    ${PROMPT_VERSION_SELECT}
    WHERE "versionHash" = $1
      AND ${scope.clause}
  `;

  const rows = await executeQuery<PromptVersionRow>(query, [versionHash, ...scope.params], {
    operationName: 'PromptVersion.getByHash',
    requireTenant: scope.requireTenant,
  });
  const row = rows[0];
  return row ? mapRowToVersion(row) : null;
}

/**
 * Get version history for a node
 * Validates: Requirements 4.3
 */
export async function getVersionHistory(
  nodeId: string,
  branchName?: string
): Promise<PromptVersion[]> {
  const params: unknown[] = [nodeId];
  let query = `
    ${PROMPT_VERSION_SELECT}
    WHERE "nodeId" = $1
  `;

  if (branchName) {
    query += ` AND "branchName" = $2`;
    params.push(branchName);
  }

  const scope = buildAccessibleTenantScope('PromptVersion.getHistory', branchName ? 3 : 2);
  query += ` AND ${scope.clause}`;
  query += ` ORDER BY "createdAt" DESC`;
  params.push(...scope.params);

  const rows = await executeQuery<PromptVersionRow>(query, params, {
    operationName: 'PromptVersion.getHistory',
    requireTenant: scope.requireTenant,
  });
  return rows.map(mapRowToVersion);
}

/**
 * Get active version for a node
 */
export async function getActiveVersion(nodeId: string): Promise<PromptVersion | null> {
  const scope = buildAccessibleTenantScope('PromptVersion.getActive', 2);
  const query = `
    ${PROMPT_VERSION_SELECT}
    WHERE "nodeId" = $1
      AND "isActive" = TRUE
      AND ${scope.clause}
    LIMIT 1
  `;

  const rows = await executeQuery<PromptVersionRow>(query, [nodeId, ...scope.params], {
    operationName: 'PromptVersion.getActive',
    requireTenant: scope.requireTenant,
  });
  const row = rows[0];
  return row ? mapRowToVersion(row) : null;
}

/**
 * Set a version as active (deactivates all other versions for the node)
 * Validates: Requirements 4.4
 */
export async function setActiveVersion(versionHash: string): Promise<void> {
  const version = await getVersionByHash(versionHash);
  if (!version) {
    throw new Error(`Version ${versionHash} not found`);
  }

  const deactivateScope = buildExactTenantScope(2, version.tenantId ?? null);
  await executeCommand(
    `UPDATE "PromptVersion" SET "isActive" = FALSE WHERE "nodeId" = $1 AND ${deactivateScope.clause}`,
    [version.nodeId, ...deactivateScope.params],
    {
      operationName: 'PromptVersion.deactivateSiblings',
      requireTenant: deactivateScope.requireTenant,
    }
  );

  const activateScope = buildExactTenantScope(2, version.tenantId ?? null);
  await executeCommand(
    `UPDATE "PromptVersion" SET "isActive" = TRUE WHERE "versionHash" = $1 AND ${activateScope.clause}`,
    [versionHash, ...activateScope.params],
    {
      operationName: 'PromptVersion.activate',
      requireTenant: activateScope.requireTenant,
    }
  );
}

/**
 * Rollback to a previous version
 * Validates: Requirements 4.4
 */
export async function rollbackToVersion(versionHash: string): Promise<PromptVersion> {
  await setActiveVersion(versionHash);
  const version = await getVersionByHash(versionHash);
  if (!version) {
    throw new Error(`Version ${versionHash} not found after rollback`);
  }
  return version;
}

/**
 * Create a branch from a parent version
 * Validates: Requirements 4.5
 */
export async function createBranch(
  fromVersionHash: string,
  branchName: string,
  createdBy: string
): Promise<PromptVersion> {
  const parentVersion = await getVersionByHash(fromVersionHash);
  if (!parentVersion) {
    throw new Error(`Parent version ${fromVersionHash} not found`);
  }

  return createVersion(
    parentVersion.nodeId,
    parentVersion.promptText,
    createdBy,
    `Created branch '${branchName}' from ${fromVersionHash.substring(0, 8)}`,
    fromVersionHash,
    branchName
  );
}

/**
 * Compare two versions and calculate performance delta
 * Validates: Requirements 4.6
 */
export async function compareVersions(hash1: string, hash2: string): Promise<VersionComparison> {
  const [version1, version2] = await Promise.all([
    getVersionByHash(hash1),
    getVersionByHash(hash2),
  ]);

  if (!version1 || !version2) {
    throw new Error('One or both versions not found');
  }

  const [metrics1, metrics2] = await Promise.all([
    getAggregateMetrics(hash1),
    getAggregateMetrics(hash2),
  ]);

  const performanceDelta: PerformanceDelta = {
    qualityScoreChange: metrics2.avgQualityScore - metrics1.avgQualityScore,
    costChange: metrics2.avgCostUSD - metrics1.avgCostUSD,
    latencyChange: metrics2.avgLatencyMs - metrics1.avgLatencyMs,
    comparedToVersion: hash1,
  };

  const textDiff = generateTextDiff(version1.promptText, version2.promptText);

  return {
    version1,
    version2,
    textDiff,
    performanceDelta,
  };
}

/**
 * Get all versions with their performance deltas
 * Validates: Requirements 4.3
 */
export async function getVersionHistoryWithDeltas(nodeId: string): Promise<PromptVersion[]> {
  const versions = await getVersionHistory(nodeId);

  for (let index = 0; index < versions.length; index += 1) {
    const version = versions[index];
    if (version?.parentVersionHash) {
      const [currentMetrics, parentMetrics] = await Promise.all([
        getAggregateMetrics(version.versionHash),
        getAggregateMetrics(version.parentVersionHash),
      ]);

      version.performanceDelta = {
        qualityScoreChange: currentMetrics.avgQualityScore - parentMetrics.avgQualityScore,
        costChange: currentMetrics.avgCostUSD - parentMetrics.avgCostUSD,
        latencyChange: currentMetrics.avgLatencyMs - parentMetrics.avgLatencyMs,
        comparedToVersion: version.parentVersionHash,
      };
    }
  }

  return versions;
}

/**
 * Generate a simple text diff between two strings
 */
function generateTextDiff(text1: string, text2: string): string {
  const lines1 = text1.split('\n');
  const lines2 = text2.split('\n');

  const diff: string[] = [];
  const maxLines = Math.max(lines1.length, lines2.length);

  for (let index = 0; index < maxLines; index += 1) {
    const line1 = lines1[index] || '';
    const line2 = lines2[index] || '';

    if (line1 !== line2) {
      if (line1) diff.push(`- ${line1}`);
      if (line2) diff.push(`+ ${line2}`);
    } else {
      diff.push(`  ${line1}`);
    }
  }

  return diff.join('\n');
}

/**
 * Map database row to domain object
 */
function mapRowToVersion(row: PromptVersionRow): PromptVersion {
  return {
    versionHash: row.version_hash,
    nodeId: row.node_id,
    promptText: row.prompt_text,
    createdAt: row.created_at,
    createdBy: row.created_by,
    parentVersionHash: row.parent_version_hash || undefined,
    branchName: row.branch_name,
    changelog: row.changelog,
    isActive: row.is_active,
    tenantId: row.tenant_id || undefined,
  };
}
