/**
 * Database sharding configuration for millions of audit records.
 * Shards by `tenant_id` to ensure tenant data locality (Requirement 17.3).
 */

export interface DatabaseShardConfig {
  shardKey: 'tenant_id';
  shardCount: number;
  replicationFactor: number;
  readReplicas: number;
}

export type ShardStatus = 'healthy' | 'degraded' | 'offline';

export interface ShardHealth {
  shardId: number;
  status: ShardStatus;
  recordCount: number;
  replicationLag: number; // milliseconds
  primaryNode: string;
  replicaNodes: string[];
}

export interface RebalanceResult {
  startedAt: Date;
  completedAt: Date;
  shardsRebalanced: number;
  recordsMoved: number;
  durationMs: number;
  status: 'completed' | 'partial' | 'failed';
  details: string;
}

// Default sharding configuration for millions of audit records.
// 8 shards × 3 replicas provides strong read throughput and fault tolerance.
const DEFAULT_SHARD_CONFIG: DatabaseShardConfig = {
  shardKey: 'tenant_id',
  shardCount: 8,
  replicationFactor: 3,
  readReplicas: 2,
};

let activeConfig: DatabaseShardConfig = { ...DEFAULT_SHARD_CONFIG };

// Simulated shard state — in production this would be read from the database cluster API
let simulatedShardState: ShardHealth[] = buildInitialShardState(DEFAULT_SHARD_CONFIG);

function buildInitialShardState(config: DatabaseShardConfig): ShardHealth[] {
  return Array.from({ length: config.shardCount }, (_, i) => ({
    shardId: i,
    status: 'healthy' as ShardStatus,
    // Simulate roughly even distribution with slight variance
    recordCount: Math.floor(100_000 + Math.random() * 20_000),
    replicationLag: Math.floor(Math.random() * 15),
    primaryNode: `db-shard-${i}-primary`,
    replicaNodes: Array.from(
      { length: config.readReplicas },
      (_, r) => `db-shard-${i}-replica-${r}`
    ),
  }));
}

/**
 * Returns the active sharding configuration.
 */
export function getShardConfig(): DatabaseShardConfig {
  return { ...activeConfig };
}

/**
 * Returns per-shard health status including record counts and replication lag.
 * In production this would query the database cluster health API.
 */
export function getShardHealth(): ShardHealth[] {
  return simulatedShardState.map((shard) => ({ ...shard, replicaNodes: [...shard.replicaNodes] }));
}

/**
 * Simulates a shard rebalance operation — redistributes records evenly across shards.
 * In production this would trigger an online rebalance via the database cluster API.
 */
export function rebalanceShards(): RebalanceResult {
  const startedAt = new Date();

  const totalRecords = simulatedShardState.reduce((sum, s) => sum + s.recordCount, 0);
  const targetPerShard = Math.floor(totalRecords / activeConfig.shardCount);

  let recordsMoved = 0;
  let shardsRebalanced = 0;

  simulatedShardState = simulatedShardState.map((shard) => {
    const delta = Math.abs(shard.recordCount - targetPerShard);
    if (delta > 0) {
      recordsMoved += delta;
      shardsRebalanced++;
    }
    return {
      ...shard,
      recordCount: targetPerShard,
      replicationLag: Math.floor(Math.random() * 5), // lag drops after rebalance
      status: 'healthy' as ShardStatus,
    };
  });

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  return {
    startedAt,
    completedAt,
    shardsRebalanced,
    recordsMoved,
    durationMs,
    status: 'completed',
    details: `Rebalanced ${shardsRebalanced} shards, moved ${recordsMoved} records to target ${targetPerShard} records/shard`,
  };
}

/**
 * Applies a new sharding configuration and rebuilds simulated shard state.
 * Validates that shardCount >= 1 and replicationFactor >= 1.
 */
export function applyShardConfig(config: Partial<DatabaseShardConfig>): DatabaseShardConfig {
  const merged: DatabaseShardConfig = { ...activeConfig, ...config, shardKey: 'tenant_id' };

  if (merged.shardCount < 1) {
    throw new Error('shardCount must be >= 1');
  }
  if (merged.replicationFactor < 1) {
    throw new Error('replicationFactor must be >= 1');
  }
  if (merged.readReplicas < 0) {
    throw new Error('readReplicas must be >= 0');
  }

  activeConfig = merged;
  simulatedShardState = buildInitialShardState(activeConfig);

  return { ...activeConfig };
}

/**
 * Returns the default sharding configuration.
 */
export function getDefaultShardConfig(): DatabaseShardConfig {
  return { ...DEFAULT_SHARD_CONFIG };
}

/**
 * Resets to default config (useful for testing).
 */
export function resetShardConfig(): void {
  activeConfig = { ...DEFAULT_SHARD_CONFIG };
  simulatedShardState = buildInitialShardState(DEFAULT_SHARD_CONFIG);
}
