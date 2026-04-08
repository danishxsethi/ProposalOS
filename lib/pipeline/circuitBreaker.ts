/**
 * Circuit Breaker Pattern Implementation
 *
 * Automatically pauses pipeline stages when error rates exceed thresholds.
 * Provides visibility into stage health and prevents cascade failures.
 *
 * Requirements: Auto-pause on failure spikes, admin alerting
 */

import { logger } from '@/lib/logger';
import { sendAlert } from '@/lib/notifications/slack';
import { prisma } from '@/lib/prisma';
import { createScopedPrisma } from '@/lib/tenant/context';

import { PipelineStage } from './types';

/**
 * Circuit state enumeration
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker configuration per tenant
 */
export interface CircuitBreakerConfig {
  enabled: boolean;
  errorRateThreshold: number; // 0.0-1.0, e.g., 0.5 = 50%
  minSamples: number; // Minimum samples before circuit can open
  windowMs: number; // Time window for error rate calculation
  openTimeoutMs: number; // How long circuit stays open before half-open
  halfOpenMaxAttempts: number; // Max attempts in half-open state
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  errorRateThreshold: 0.5, // 50% error rate triggers circuit
  minSamples: 10, // Need at least 10 samples
  windowMs: 5 * 60 * 1000, // 5 minute window
  openTimeoutMs: 10 * 60 * 1000, // 10 minutes open before half-open
  halfOpenMaxAttempts: 5, // 5 attempts in half-open state
};

/**
 * Circuit breaker state for a stage
 */
export interface CircuitStateRecord {
  tenantId: string;
  stage: PipelineStage;
  state: CircuitState;
  errorCount: number;
  successCount: number;
  totalAttempts: number;
  lastErrorAt: Date | null;
  lastStateChangeAt: Date;
  halfOpenAttempts: number;
  metadata?: Record<string, unknown>;
}

/**
 * Get circuit breaker config for a tenant
 */
export async function getConfig(tenantId: string): Promise<CircuitBreakerConfig> {
  const config = await prisma.pipelineConfig.findUnique({
    where: { tenantId },
  });

  if (!config) {
    return DEFAULT_CONFIG;
  }

  return {
    enabled: config.circuitBreakerEnabled ?? DEFAULT_CONFIG.enabled,
    errorRateThreshold: config.errorRateThreshold ?? DEFAULT_CONFIG.errorRateThreshold,
    minSamples: config.circuitBreakerMinSamples ?? DEFAULT_CONFIG.minSamples,
    windowMs: config.circuitBreakerWindowMs ?? DEFAULT_CONFIG.windowMs,
    openTimeoutMs: config.circuitBreakerOpenTimeoutMs ?? DEFAULT_CONFIG.openTimeoutMs,
    halfOpenMaxAttempts:
      config.circuitBreakerHalfOpenMaxAttempts ?? DEFAULT_CONFIG.halfOpenMaxAttempts,
  };
}

/**
 * Get or create circuit state for a tenant/stage combination
 */
export async function getCircuitState(
  tenantId: string,
  stage: PipelineStage
): Promise<CircuitStateRecord> {
  const prismaScoped = createScopedPrisma(tenantId);

  let record = await prismaScoped.circuitBreakerState.findUnique({
    where: {
      tenantId_stage: {
        tenantId,
        stage,
      },
    },
  });

  if (!record) {
    record = await prismaScoped.circuitBreakerState.create({
      data: {
        tenantId,
        stage,
        state: 'CLOSED',
        errorCount: 0,
        successCount: 0,
        totalAttempts: 0,
        lastErrorAt: null,
        lastStateChangeAt: new Date(),
        halfOpenAttempts: 0,
      },
    });
  }

  return {
    tenantId: record.tenantId,
    stage: record.stage as PipelineStage,
    state: record.state as CircuitState,
    errorCount: record.errorCount,
    successCount: record.successCount,
    totalAttempts: record.totalAttempts,
    lastErrorAt: record.lastErrorAt,
    lastStateChangeAt: record.lastStateChangeAt,
    halfOpenAttempts: record.halfOpenAttempts,
  };
}

/**
 * Record a successful operation
 */
export async function recordSuccess(tenantId: string, stage: PipelineStage): Promise<void> {
  const prismaScoped = createScopedPrisma(tenantId);
  const config = await getConfig(tenantId);
  const circuit = await getCircuitState(tenantId, stage);

  await prismaScoped.circuitBreakerState.update({
    where: {
      tenantId_stage: {
        tenantId,
        stage,
      },
    },
    data: {
      successCount: { increment: 1 },
      totalAttempts: { increment: 1 },
      // If half-open and success, may close circuit
      state:
        circuit.state === 'HALF_OPEN' && circuit.halfOpenAttempts >= config.halfOpenMaxAttempts
          ? 'CLOSED'
          : circuit.state,
      halfOpenAttempts: circuit.state === 'HALF_OPEN' ? circuit.halfOpenAttempts + 1 : 0,
      lastStateChangeAt:
        circuit.state === 'HALF_OPEN' && circuit.halfOpenAttempts >= config.halfOpenMaxAttempts
          ? new Date()
          : circuit.lastStateChangeAt,
    },
  });

  logger.info(
    {
      event: 'circuit_breaker.success',
      tenantId,
      stage,
      state: circuit.state,
    },
    `Recorded success for circuit breaker`
  );
}

/**
 * Record a failed operation
 */
export async function recordFailure(
  tenantId: string,
  stage: PipelineStage,
  error: Error
): Promise<void> {
  const prismaScoped = createScopedPrisma(tenantId);
  const config = await getConfig(tenantId);
  const circuit = await getCircuitState(tenantId, stage);
  const now = new Date();

  if (!config.enabled) {
    return;
  }

  // Calculate error rate in window
  const errorRate = await calculateErrorRate(tenantId, stage, config.windowMs);

  // Check if circuit should open
  if (
    circuit.state === 'CLOSED' &&
    errorRate.total >= config.minSamples &&
    errorRate.rate >= config.errorRateThreshold
  ) {
    await openCircuit(tenantId, stage, errorRate.rate);
    return;
  }

  // Update failure counts
  await prismaScoped.circuitBreakerState.update({
    where: {
      tenantId_stage: {
        tenantId,
        stage,
      },
    },
    data: {
      errorCount: { increment: 1 },
      totalAttempts: { increment: 1 },
      lastErrorAt: now,
      // If half-open and failure, reopen circuit
      state: circuit.state === 'HALF_OPEN' ? 'OPEN' : circuit.state,
      halfOpenAttempts: circuit.state === 'HALF_OPEN' ? 0 : circuit.halfOpenAttempts,
      lastStateChangeAt: circuit.state === 'HALF_OPEN' ? now : circuit.lastStateChangeAt,
    },
  });

  logger.warn(
    {
      event: 'circuit_breaker.failure',
      tenantId,
      stage,
      errorRate: errorRate.rate,
      state: circuit.state,
    },
    `Recorded failure for circuit breaker`
  );
}

/**
 * Open the circuit (pause the stage)
 */
async function openCircuit(
  tenantId: string,
  stage: PipelineStage,
  errorRate: number
): Promise<void> {
  const prismaScoped = createScopedPrisma(tenantId);
  const config = await getConfig(tenantId);
  const now = new Date();

  // Update circuit state to OPEN
  await prismaScoped.circuitBreakerState.update({
    where: {
      tenantId_stage: {
        tenantId,
        stage,
      },
    },
    data: {
      state: 'OPEN',
      lastStateChangeAt: now,
      halfOpenAttempts: 0,
    },
  });

  // Pause the pipeline stage
  const pipelineConfig = await prismaScoped.pipelineConfig.findUnique({
    where: { tenantId },
  });

  if (pipelineConfig) {
    const pausedStages = (pipelineConfig.pausedStages as string[]) || [];
    if (!pausedStages.includes(stage)) {
      await prismaScoped.pipelineConfig.update({
        where: { tenantId },
        data: {
          pausedStages: [...pausedStages, stage],
        },
      });
    }
  }

  // Send alert to admins
  await sendAlert({
    tenantId,
    type: 'CIRCUIT_BREAKER_OPEN',
    title: `Circuit Breaker Opened: ${stage}`,
    message: `Pipeline stage ${stage} has been auto-paused due to high error rate (${(errorRate * 100).toFixed(1)}%). Threshold: ${(config.errorRateThreshold * 100).toFixed(1)}%.`,
    severity: 'high',
    metadata: {
      stage,
      errorRate,
      threshold: config.errorRateThreshold,
      openedAt: now.toISOString(),
    },
  });

  logger.error(
    {
      event: 'circuit_breaker.opened',
      tenantId,
      stage,
      errorRate,
      threshold: config.errorRateThreshold,
    },
    `Circuit breaker OPENED for stage ${stage}`
  );
}

/**
 * Check if circuit allows operation (CLOSED or HALF_OPEN with attempts remaining)
 */
export async function canProceed(
  tenantId: string,
  stage: PipelineStage
): Promise<{ allowed: boolean; reason?: string }> {
  const config = await getConfig(tenantId);

  if (!config.enabled) {
    return { allowed: true };
  }

  const circuit = await getCircuitState(tenantId, stage);
  const now = new Date();

  if (circuit.state === 'CLOSED') {
    return { allowed: true };
  }

  if (circuit.state === 'OPEN') {
    // Check if enough time has passed to transition to HALF_OPEN
    const timeSinceOpen = now.getTime() - circuit.lastStateChangeAt.getTime();

    if (timeSinceOpen >= config.openTimeoutMs) {
      // Transition to HALF_OPEN
      const prismaScoped = createScopedPrisma(tenantId);
      await prismaScoped.circuitBreakerState.update({
        where: {
          tenantId_stage: {
            tenantId,
            stage,
          },
        },
        data: {
          state: 'HALF_OPEN',
          lastStateChangeAt: now,
          halfOpenAttempts: 0,
        },
      });

      logger.info(
        {
          event: 'circuit_breaker.half_open',
          tenantId,
          stage,
        },
        `Circuit breaker transitioned to HALF_OPEN`
      );

      return { allowed: true };
    }

    const remainingMs = config.openTimeoutMs - timeSinceOpen;
    return {
      allowed: false,
      reason: `Circuit is OPEN. Retry in ${Math.ceil(remainingMs / 1000)}s`,
    };
  }

  if (circuit.state === 'HALF_OPEN') {
    if (circuit.halfOpenAttempts < config.halfOpenMaxAttempts) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Circuit is HALF_OPEN with max attempts reached`,
    };
  }

  return { allowed: true };
}

/**
 * Calculate error rate within a time window
 */
async function calculateErrorRate(
  tenantId: string,
  stage: PipelineStage,
  windowMs: number
): Promise<{ rate: number; total: number; errors: number; successes: number }> {
  const prismaScoped = createScopedPrisma(tenantId);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  // Get error logs in window
  const errorCount = await prismaScoped.pipelineErrorLog.count({
    where: {
      tenantId,
      stage,
      createdAt: { gte: windowStart },
    },
  });

  // Get successful transitions in window
  const successCount = await prismaScoped.prospectStateTransition.count({
    where: {
      tenantId,
      stage,
      createdAt: { gte: windowStart },
    },
  });

  const total = errorCount + successCount;
  const rate = total > 0 ? errorCount / total : 0;

  return {
    rate,
    total,
    errors: errorCount,
    successes: successCount,
  };
}

/**
 * Manually reset circuit breaker for a stage
 */
export async function resetCircuit(
  tenantId: string,
  stage: PipelineStage,
  operatorId: string
): Promise<void> {
  const prismaScoped = createScopedPrisma(tenantId);

  await prismaScoped.circuitBreakerState.update({
    where: {
      tenantId_stage: {
        tenantId,
        stage,
      },
    },
    data: {
      state: 'CLOSED',
      errorCount: 0,
      successCount: 0,
      totalAttempts: 0,
      lastErrorAt: null,
      lastStateChangeAt: new Date(),
      halfOpenAttempts: 0,
    },
  });

  // Also resume the pipeline stage
  const pipelineConfig = await prismaScoped.pipelineConfig.findUnique({
    where: { tenantId },
  });

  if (pipelineConfig) {
    const pausedStages = (pipelineConfig.pausedStages as string[]) || [];
    const filteredStages = pausedStages.filter((s) => s !== stage);

    await prismaScoped.pipelineConfig.update({
      where: { tenantId },
      data: {
        pausedStages: filteredStages,
      },
    });
  }

  logger.info(
    {
      event: 'circuit_breaker.reset',
      tenantId,
      stage,
      operatorId,
    },
    `Circuit breaker manually reset by ${operatorId}`
  );
}

/**
 * Get circuit breaker status for all stages
 */
export async function getCircuitStatus(tenantId: string): Promise<
  Array<{
    stage: PipelineStage;
    state: CircuitState;
    errorRate: number;
    lastErrorAt: Date | null;
    canProceed: boolean;
  }>
> {
  const config = await getConfig(tenantId);
  const stages = Object.values(PipelineStage);
  const status: Array<{
    stage: PipelineStage;
    state: CircuitState;
    errorRate: number;
    lastErrorAt: Date | null;
    canProceed: boolean;
  }> = [];

  for (const stage of stages) {
    const circuit = await getCircuitState(tenantId, stage);
    const errorRate = await calculateErrorRate(tenantId, stage, config.windowMs);
    const proceedCheck = await canProceed(tenantId, stage);

    status.push({
      stage,
      state: circuit.state,
      errorRate: errorRate.rate,
      lastErrorAt: circuit.lastErrorAt,
      canProceed: proceedCheck.allowed,
    });
  }

  return status;
}

/**
 * Cron job to check and potentially auto-close circuits
 */
export async function checkCircuits(): Promise<{
  checked: number;
  autoClosed: number;
  alerted: number;
}> {
  const allConfigs = await prisma.pipelineConfig.findMany({
    where: { circuitBreakerEnabled: true },
  });

  let checked = 0;
  let autoClosed = 0;
  let alerted = 0;

  for (const config of allConfigs) {
    const tenantId = config.tenantId;
    const circuitConfig = await getConfig(tenantId);
    const stages = Object.values(PipelineStage);

    for (const stage of stages) {
      checked++;
      const circuit = await getCircuitState(tenantId, stage);

      if (circuit.state === 'OPEN') {
        const errorRate = await calculateErrorRate(tenantId, stage, circuitConfig.windowMs);

        // If error rate has dropped below threshold, auto-close
        if (errorRate.rate < circuitConfig.errorRateThreshold * 0.5) {
          await resetCircuit(tenantId, stage, 'auto');
          autoClosed++;

          await sendAlert({
            tenantId,
            type: 'CIRCUIT_BREAKER_AUTO_CLOSED',
            title: `Circuit Breaker Auto-Closed: ${stage}`,
            message: `Pipeline stage ${stage} has been auto-resumed. Error rate dropped to ${(errorRate.rate * 100).toFixed(1)}%.`,
            severity: 'info',
            metadata: {
              stage,
              errorRate: errorRate.rate,
            },
          });

          alerted++;
        }
      }
    }
  }

  return { checked, autoClosed, alerted };
}
