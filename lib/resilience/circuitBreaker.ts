/**
 * lib/resilience/circuitBreaker.ts
 *
 * Distributed Circuit Breaker for Third-Party Providers
 */

import { logger } from '@/lib/logger';
import { getSharedStore } from '@/lib/store/shared';

import { CircuitBreakerOpenError, ProviderName, ProviderPolicy } from './types';

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: number;
}

function getCircuitBreakerKey(provider: ProviderName, tenantId?: string): string {
  const baseKey = `cb:provider:${provider}`;
  return tenantId ? `${baseKey}:tenant:${tenantId}` : baseKey;
}

/**
 * Checks the current circuit state for a provider/tenant.
 * Throws CircuitBreakerOpenError if the circuit is open and cooldown is active.
 * Transitions to HALF-OPEN if the cooldown period has expired.
 */
export async function checkCircuitBreaker(
  provider: ProviderName,
  operation: string,
  tenantId?: string,
  policy?: ProviderPolicy
): Promise<void> {
  // Skip circuit breaker in tests unless explicitly enabled
  if (process.env.NODE_ENV === 'test' && process.env.ENABLE_PROVIDER_CB_TEST !== 'true') {
    return;
  }

  const threshold = policy?.circuitBreakerFailureThreshold ?? 5;
  const cooldownMs = policy?.circuitBreakerCooldownMs ?? 60000;
  const key = getCircuitBreakerKey(provider, tenantId);

  try {
    const store = await getSharedStore();
    const rawState = await store.get(key);

    if (!rawState) {
      return; // No failure state, circuit is CLOSED
    }

    const stateObj: CircuitBreakerState = JSON.parse(rawState);

    if (stateObj.state === 'open') {
      const lastFailure = stateObj.lastFailureTime ?? 0;
      const elapsed = Date.now() - lastFailure;

      if (elapsed >= cooldownMs) {
        // Cooldown expired, transition to HALF-OPEN
        stateObj.state = 'half-open';
        // We set a long TTL (e.g. 1 day) or just standard cooldown, since we manage the state ourselves.
        // Let's set TTL to 24 hours to clean up unused keys.
        await store.set(key, JSON.stringify(stateObj), 86400);

        logger.info(
          { provider, tenantId, operation },
          `Circuit breaker transitioned to HALF-OPEN for provider "${provider}" after cooldown.`
        );
        return;
      }

      // Circuit is still open, fail fast
      const remainingMs = cooldownMs - elapsed;
      throw new CircuitBreakerOpenError(provider, operation, remainingMs);
    }
  } catch (err) {
    if (err instanceof CircuitBreakerOpenError) {
      throw err;
    }
    logger.error(
      { err, provider, tenantId, operation },
      'Error checking circuit breaker — failing closed (allowing request)'
    );
  }
}

/**
 * Records a successful call, resetting failure state and closing the circuit.
 */
export async function recordCircuitSuccess(
  provider: ProviderName,
  tenantId?: string
): Promise<void> {
  const key = getCircuitBreakerKey(provider, tenantId);

  try {
    const store = await getSharedStore();
    const rawState = await store.get(key);

    if (!rawState) {
      return; // Already closed/empty
    }

    const stateObj: CircuitBreakerState = JSON.parse(rawState);

    if (stateObj.state !== 'closed' || stateObj.failureCount > 0) {
      logger.info(
        { provider, tenantId },
        `Circuit breaker CLOSED and reset for provider "${provider}" on success.`
      );
      await store.del(key);
    }
  } catch (err) {
    logger.error({ err, provider, tenantId }, 'Error recording circuit breaker success');
  }
}

/**
 * Records a failed call, incrementing failure count and potentially opening the circuit.
 */
export async function recordCircuitFailure(
  provider: ProviderName,
  tenantId?: string,
  policy?: ProviderPolicy
): Promise<void> {
  const threshold = policy?.circuitBreakerFailureThreshold ?? 5;
  const key = getCircuitBreakerKey(provider, tenantId);

  try {
    const store = await getSharedStore();
    const rawState = await store.get(key);

    let stateObj: CircuitBreakerState = {
      state: 'closed',
      failureCount: 0,
    };

    if (rawState) {
      stateObj = JSON.parse(rawState);
    }

    stateObj.failureCount += 1;

    if (stateObj.failureCount >= threshold && stateObj.state !== 'open') {
      stateObj.state = 'open';
      stateObj.lastFailureTime = Date.now();
      logger.warn(
        { provider, tenantId, failureCount: stateObj.failureCount },
        `Circuit breaker opened for provider "${provider}" after reaching ${stateObj.failureCount} consecutive failures.`
      );
    } else {
      logger.debug(
        { provider, tenantId, failureCount: stateObj.failureCount },
        `Circuit breaker recorded failure for provider "${provider}". Failure count: ${stateObj.failureCount}/${threshold}`
      );
    }

    // Set TTL to 24 hours to ensure cleanup of stale states
    await store.set(key, JSON.stringify(stateObj), 86400);
  } catch (err) {
    logger.error({ err, provider, tenantId }, 'Error recording circuit breaker failure');
  }
}
