/**
 * Integration Circuit Breaker
 * 
 * Circuit breaker pattern for external API integrations.
 * Prevents cascade failures by failing fast when services are unavailable.
 */

import { logger } from '@/lib/logger';

import { INTEGRATIONS, CIRCUIT_BREAKER_CONFIG } from './config';

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureAt?: Date;
  lastSuccessAt?: Date;
  openedAt?: Date;
  halfOpenAttempts: number;
}

/**
 * Circuit breaker configuration for an integration
 */
interface IntegrationCircuitConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
}

/**
 * Circuit breaker class for a single integration
 */
export class IntegrationCircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt?: Date;
  private lastSuccessAt?: Date;
  private openedAt?: Date;
  private halfOpenAttempts = 0;
  
  private readonly config: IntegrationCircuitConfig;
  private readonly integrationName: string;

  constructor(
    integrationName: string,
    config?: Partial<IntegrationCircuitConfig>
  ) {
    this.integrationName = integrationName;
    this.config = {
      failureThreshold: config?.failureThreshold ?? CIRCUIT_BREAKER_CONFIG.failureThreshold,
      successThreshold: config?.successThreshold ?? CIRCUIT_BREAKER_CONFIG.successThreshold,
      timeoutMs: config?.timeoutMs ?? CIRCUIT_BREAKER_CONFIG.timeoutMs,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit allows the call
    if (!this.canExecute()) {
      throw new Error(
        `Circuit breaker OPEN for ${this.integrationName}. Retry after ${this.getRetryAfterMs()}ms`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if circuit breaker allows execution
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      // Check if timeout has elapsed to transition to HALF_OPEN
      if (this.openedAt) {
        const elapsed = Date.now() - this.openedAt.getTime();
        if (elapsed >= this.config.timeoutMs) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
      }
      return false;
    }

    if (this.state === 'HALF_OPEN') {
      // Allow limited attempts in half-open state
      return this.halfOpenAttempts < this.config.successThreshold;
    }

    return true;
  }

  /**
   * Get time until retry is allowed (when circuit is OPEN)
   */
  getRetryAfterMs(): number {
    if (this.state !== 'OPEN' || !this.openedAt) {
      return 0;
    }
    const elapsed = Date.now() - this.openedAt.getTime();
    return Math.max(0, this.config.timeoutMs - elapsed);
  }

  /**
   * Record a successful call
   */
  onSuccess(): void {
    this.successCount++;
    this.lastSuccessAt = new Date();

    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
        logger.info(
          { integration: this.integrationName },
          `Circuit breaker CLOSED for ${this.integrationName} after successful half-open tests`
        );
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed call
   */
  onFailure(): void {
    this.failureCount++;
    this.lastFailureAt = new Date();

    if (this.state === 'HALF_OPEN') {
      // Immediately reopen on failure in half-open state
      this.transitionTo('OPEN');
      logger.warn(
        { integration: this.integrationName, failureCount: this.failureCount },
        `Circuit breaker REOPENED for ${this.integrationName} after half-open failure`
      );
    } else if (this.state === 'CLOSED') {
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
        logger.warn(
          { integration: this.integrationName, failureCount: this.failureCount },
          `Circuit breaker OPENED for ${this.integrationName} after ${this.failureCount} failures`
        );
      }
    }
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;
    this.openedAt = undefined;
    logger.info(
      { integration: this.integrationName },
      `Circuit breaker manually RESET for ${this.integrationName}`
    );
  }

  /**
   * Get current state and statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      openedAt: this.openedAt,
      halfOpenAttempts: this.halfOpenAttempts,
    };
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'OPEN') {
      this.openedAt = new Date();
      this.halfOpenAttempts = 0;
    }
  }
}

/**
 * Registry of circuit breakers for each integration
 */
const circuitBreakers: Map<string, IntegrationCircuitBreaker> = new Map();

/**
 * Get or create circuit breaker for an integration
 */
export function getCircuitBreaker(integrationName: string): IntegrationCircuitBreaker {
  if (!circuitBreakers.has(integrationName)) {
    const config = INTEGRATIONS[integrationName];
    circuitBreakers.set(
      integrationName,
      new IntegrationCircuitBreaker(integrationName, {
        failureThreshold: config?.circuitBreakerEnabled ? 5 : undefined,
        timeoutMs: config?.circuitBreakerEnabled ? 60000 : undefined,
      })
    );
  }
  return circuitBreakers.get(integrationName)!;
}

/**
 * Reset circuit breaker for an integration
 */
export function resetCircuitBreaker(integrationName: string): void {
  const breaker = circuitBreakers.get(integrationName);
  if (breaker) {
    breaker.reset();
  }
}

/**
 * Record success for an integration
 */
export function recordIntegrationSuccess(integrationName: string): void {
  const breaker = circuitBreakers.get(integrationName);
  if (breaker) {
    breaker.onSuccess();
  }
}

/**
 * Record failure for an integration
 */
export function recordIntegrationFailure(integrationName: string, error?: any): void {
  const breaker = circuitBreakers.get(integrationName);
  if (breaker) {
    breaker.onFailure();
  }
}

/**
 * Check if we can make a call to an integration
 */
export function canMakeIntegrationCall(integrationName: string): {
  allowed: boolean;
  state: CircuitBreakerState;
  retryAfterMs?: number;
} {
  const breaker = getCircuitBreaker(integrationName);
  const canExecute = breaker.canExecute();
  const stats = breaker.getStats();

  return {
    allowed: canExecute,
    state: stats.state,
    retryAfterMs: canExecute ? undefined : breaker.getRetryAfterMs(),
  };
}

/**
 * Get status of all circuit breakers
 */
export function getAllCircuitBreakersStatus(): Record<string, CircuitBreakerStats> {
  const status: Record<string, CircuitBreakerStats> = {};
  for (const [name, breaker] of circuitBreakers.entries()) {
    status[name] = breaker.getStats();
  }
  return status;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  for (const breaker of circuitBreakers.values()) {
    breaker.reset();
  }
}