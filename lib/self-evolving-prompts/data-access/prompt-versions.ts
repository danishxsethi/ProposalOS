/**
 * Data Access Layer for Prompt Versions
 * Implements version control operations
 */

import { createHash } from 'crypto';
import { executeQuery, executeCommand } from '../db';
import {
  PromptVersion,
  PromptVersionRow,
  PerformanceDelta,
  VersionComparison,
} from '../types';
import { getAggregateMetrics } from './prompt-performance';

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
  // Validate changelog is not empty
  if (!changelog || changelog.trim().length === 0) {
    throw new Error('Changelog cannot be empty');
  }

  const versionHash = generateVersionHash(nodeId, promptText);

  const query = `
    INSERT INTO prompt_versions (
      version_hash,
      node_id,
      prompt_text,
      created_by,
      parent_version_hash,
      branch_name,
      changelog,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const params = [
    versionHash,
    nodeId,
    promptText,
    createdBy,
    parentVersionHash || null,
    branchName,
    changelog,
    false, // New versions start as inactive
  ];

  const rows = await executeQuery<PromptVersionRow>(query, params);
  return mapRowToVersion(rows[0]);
}

/**
 * Get version by hash
 */
export async function getVersionByHash(
  versionHash: string
): Promise<PromptVersion | null> {
  const query = `
    SELECT * FROM prompt_versions
    WHERE version_hash = $1
  `;

  const rows = await executeQuery<PromptVersionRow>(query, [versionHash]);
  return rows.length > 0 ? mapRowToVersion(rows[0]) : null;
}

/**
 * Get version history for a node
 * Validates: Requirements 4.3
 */
export async function getVersionHistory(
  nodeId: string,
  branchName?: string
): Promise<PromptVersion[]> {
  let query = `
    SELECT * FROM prompt_versions
    WHERE node_id = $1
  `;
  const params: any[] = [nodeId];

  if (branchName) {
    query += ` AND branch_name = $2`;
    params.push(branchName);
  }

  query += ` ORDER BY created_at DESC`;

  const rows = await executeQuery<PromptVersionRow>(query, params);
  return rows.map(mapRowToVersion);
}

/**
 * Get active version for a node
 */
export async function getActiveVersion(
  nodeId: string
): Promise<PromptVersion | null> {
  const query = `
    SELECT * FROM prompt_versions
    WHERE node_id = $1 AND is_active = TRUE
    LIMIT 1
  `;

  const rows = await executeQuery<PromptVersionRow>(query, [nodeId]);
  return rows.length > 0 ? mapRowToVersion(rows[0]) : null;
}

/**
 * Set a version as active (deactivates all other versions for the node)
 * Validates: Requirements 4.4
 */
export async function setActiveVersion(
  versionHash: string
): Promise<void> {
  // First, get the node_id for this version
  const version = await getVersionByHash(versionHash);
  if (!version) {
    throw new Error(`Version ${versionHash} not found`);
  }

  // Deactivate all versions for this node
  await executeCommand(
    `UPDATE prompt_versions SET is_active = FALSE WHERE node_id = $1`,
    [version.nodeId]
  );

  // Activate the target version
  await executeCommand(
    `UPDATE prompt_versions SET is_active = TRUE WHERE version_hash = $1`,
    [versionHash]
  );
}

/**
 * Rollback to a previous version
 * Validates: Requirements 4.4
 */
export async function rollbackToVersion(
  versionHash: string
): Promise<PromptVersion> {
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
export async function compareVersions(
  hash1: string,
  hash2: string
): Promise<VersionComparison> {
  const [version1, version2] = await Promise.all([
    getVersionByHash(hash1),
    getVersionByHash(hash2),
  ]);

  if (!version1 || !version2) {
    throw new Error('One or both versions not found');
  }

  // Get performance metrics for both versions
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

  // Simple text diff (line-by-line comparison)
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
export async function getVersionHistoryWithDeltas(
  nodeId: string
): Promise<PromptVersion[]> {
  const versions = await getVersionHistory(nodeId);

  // Calculate performance deltas for each version compared to its parent
  for (let i = 0; i < versions.length; i++) {
    const version = versions[i];
    if (version.parentVersionHash) {
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

  for (let i = 0; i < maxLines; i++) {
    const line1 = lines1[i] || '';
    const line2 = lines2[i] || '';

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
  };
}
