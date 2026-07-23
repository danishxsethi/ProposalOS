/**
 * Auto-scaling configuration for Cloud Run infrastructure.
 * Targets 60,000+ prospects/day throughput (Requirement 17.1).
 */

export interface ScalingConfig {
  minInstances: number;
  maxInstances: number;
  targetCPUUtilization: number;    // 0–100 percent
  targetMemoryUtilization: number; // 0–100 percent
  scaleUpThreshold: number;        // 0–100 percent utilization that triggers scale-up
  scaleDownThreshold: number;      // 0–100 percent utilization that triggers scale-down
  cooldownSeconds: number;         // seconds between scaling events
}

export interface ScalingStatus {
  currentInstances: number;
  cpuUtilization: number;    // 0–100 percent
  memoryUtilization: number; // 0–100 percent
  requestsPerSecond: number;
  config: ScalingConfig;
  lastScaledAt: Date | null;
  scalingState: 'stable' | 'scaling_up' | 'scaling_down' | 'cooldown';
}

export interface ScalingValidationError {
  field: keyof ScalingConfig;
  message: string;
}

// Default Cloud Run configuration targeting 60,000+ prospects/day.
// At ~1 prospect/second average processing, 60K/day ≈ 0.7 req/s sustained,
// with burst peaks up to ~10x. 10 max instances handles bursts comfortably.
const DEFAULT_SCALING_CONFIG: ScalingConfig = {
  minInstances: 2,           // always-warm to avoid cold starts
  maxInstances: 50,          // supports burst to 60K+/day
  targetCPUUtilization: 60,  // scale before saturation
  targetMemoryUtilization: 70,
  scaleUpThreshold: 70,      // scale up when CPU > 70%
  scaleDownThreshold: 30,    // scale down when CPU < 30%
  cooldownSeconds: 60,       // 1-minute cooldown between events
};

let activeConfig: ScalingConfig = { ...DEFAULT_SCALING_CONFIG };

// Simulated runtime state — in production this would be read from Cloud Run metrics API
let simulatedState = {
  currentInstances: DEFAULT_SCALING_CONFIG.minInstances,
  lastScaledAt: null as Date | null,
};

/**
 * Returns the current scaling status including instance count and utilization metrics.
 * Metrics are computed/simulated based on the active config.
 */
export function getScalingStatus(): ScalingStatus {
  // Simulate utilization proportional to instance count vs max
  const loadFactor = simulatedState.currentInstances / activeConfig.maxInstances;
  const cpuUtilization = Math.round(activeConfig.targetCPUUtilization * (1 - loadFactor * 0.4));
  const memoryUtilization = Math.round(activeConfig.targetMemoryUtilization * (1 - loadFactor * 0.3));

  // Estimate requests/second: 60K prospects/day ÷ 86400 seconds ≈ 0.7 base, scaled by instances
  const requestsPerSecond = parseFloat((0.7 * simulatedState.currentInstances).toFixed(2));

  const now = Date.now();
  const lastScaled = simulatedState.lastScaledAt?.getTime() ?? 0;
  const inCooldown = now - lastScaled < activeConfig.cooldownSeconds * 1000;

  let scalingState: ScalingStatus['scalingState'] = 'stable';
  if (inCooldown) {
    scalingState = 'cooldown';
  } else if (cpuUtilization >= activeConfig.scaleUpThreshold) {
    scalingState = 'scaling_up';
  } else if (cpuUtilization <= activeConfig.scaleDownThreshold) {
    scalingState = 'scaling_down';
  }

  return {
    currentInstances: simulatedState.currentInstances,
    cpuUtilization,
    memoryUtilization,
    requestsPerSecond,
    config: { ...activeConfig },
    lastScaledAt: simulatedState.lastScaledAt,
    scalingState,
  };
}

/**
 * Validates a partial ScalingConfig override.
 * Returns an array of validation errors (empty if valid).
 */
function validateScalingConfig(
  overrides: Partial<ScalingConfig>,
  merged: ScalingConfig
): ScalingValidationError[] {
  const errors: ScalingValidationError[] = [];

  if (merged.minInstances < 0) {
    errors.push({ field: 'minInstances', message: 'minInstances must be >= 0' });
  }
  if (merged.maxInstances < 1) {
    errors.push({ field: 'maxInstances', message: 'maxInstances must be >= 1' });
  }
  if (merged.minInstances > merged.maxInstances) {
    errors.push({ field: 'minInstances', message: 'minInstances must be <= maxInstances' });
  }
  if (merged.targetCPUUtilization < 0 || merged.targetCPUUtilization > 100) {
    errors.push({ field: 'targetCPUUtilization', message: 'targetCPUUtilization must be 0–100' });
  }
  if (merged.targetMemoryUtilization < 0 || merged.targetMemoryUtilization > 100) {
    errors.push({ field: 'targetMemoryUtilization', message: 'targetMemoryUtilization must be 0–100' });
  }
  if (merged.scaleUpThreshold < 0 || merged.scaleUpThreshold > 100) {
    errors.push({ field: 'scaleUpThreshold', message: 'scaleUpThreshold must be 0–100' });
  }
  if (merged.scaleDownThreshold < 0 || merged.scaleDownThreshold > 100) {
    errors.push({ field: 'scaleDownThreshold', message: 'scaleDownThreshold must be 0–100' });
  }
  if (merged.scaleDownThreshold >= merged.scaleUpThreshold) {
    errors.push({
      field: 'scaleDownThreshold',
      message: 'scaleDownThreshold must be < scaleUpThreshold',
    });
  }
  if (merged.cooldownSeconds < 0) {
    errors.push({ field: 'cooldownSeconds', message: 'cooldownSeconds must be >= 0' });
  }

  return errors;
}

/**
 * Applies runtime overrides to the active scaling config.
 * Validates bounds before applying; throws if validation fails.
 */
export function adjustScaling(overrides: Partial<ScalingConfig>): ScalingConfig {
  const merged: ScalingConfig = { ...activeConfig, ...overrides };
  const errors = validateScalingConfig(overrides, merged);

  if (errors.length > 0) {
    const messages = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    throw new Error(`Invalid scaling config: ${messages}`);
  }

  activeConfig = merged;

  // Clamp current instances to new bounds
  simulatedState.currentInstances = Math.max(
    activeConfig.minInstances,
    Math.min(simulatedState.currentInstances, activeConfig.maxInstances)
  );
  simulatedState.lastScaledAt = new Date();

  return { ...activeConfig };
}

/**
 * Returns the default Cloud Run scaling configuration.
 */
export function getDefaultScalingConfig(): ScalingConfig {
  return { ...DEFAULT_SCALING_CONFIG };
}

/**
 * Resets the active config back to defaults (useful for testing).
 */
export function resetScalingConfig(): void {
  activeConfig = { ...DEFAULT_SCALING_CONFIG };
  simulatedState = {
    currentInstances: DEFAULT_SCALING_CONFIG.minInstances,
    lastScaledAt: null,
  };
}
