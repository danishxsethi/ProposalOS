import { createHash, randomBytes } from 'crypto';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const API_KEY_PREFIX = 'pe_live_';

// API Key scopes for fine-grained access control
export const API_KEY_SCOPES = {
  // Audit scopes
  AUDIT_READ: 'audit:read',
  AUDIT_CREATE: 'audit:create',
  AUDIT_UPDATE: 'audit:update',
  AUDIT_DELETE: 'audit:delete',

  // Proposal scopes
  PROPOSAL_READ: 'proposal:read',
  PROPOSAL_CREATE: 'proposal:create',
  PROPOSAL_UPDATE: 'proposal:update',
  PROPOSAL_DELETE: 'proposal:delete',
  PROPOSAL_SEND: 'proposal:send',

  // Tenant management scopes
  TENANT_READ: 'tenant:read',
  TENANT_UPDATE: 'tenant:update',

  // API key management
  API_KEY_READ: 'api_key:read',
  API_KEY_CREATE: 'api_key:create',
  API_KEY_DELETE: 'api_key:delete',

  // Full access (owner level)
  ALL: '*',
} as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[keyof typeof API_KEY_SCOPES];

export interface ApiKeyValidationResult {
  tenantId: string;
  scopes: string[];
  planTier: string;
  keyId: string;
  keyName: string;
  rateLimit?: {
    limit: number;
    used: number;
    remaining: number;
    resetAt: Date;
  };
}

export interface ApiKeyErrorResult {
  error: string;
  limit?: number;
  used?: number;
  remaining?: number;
  resetAt?: Date;
  retryAfter?: number;
  requiredScope?: string;
  grantedScopes?: string[];
}

export function generateApiKey() {
  const random = randomBytes(24).toString('hex'); // 48 chars
  const key = `${API_KEY_PREFIX}${random}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 12); // pe_live_XXXX
  return { key, hash, prefix };
}

/**
 * Log API key usage for audit trail
 * Note: Requires ApiKeyAuditLog model in Prisma schema
 */
async function logApiKeyUsage(
  keyId: string,
  tenantId: string,
  action: string,
  resource?: string,
  success?: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    // Try to log to database, fall back to logger if model doesn't exist yet
    await (prisma as any).apiKeyAuditLog
      ?.create({
        data: {
          keyId,
          tenantId,
          action,
          resource,
          success: success ?? true,
          errorMessage,
          timestamp: new Date(),
        },
      })
      .catch(() => {
        // Model may not exist yet, log to logger instead
        logger.info(
          { keyId, tenantId, action, resource, success, errorMessage },
          'API key audit log'
        );
      });
  } catch (error) {
    // Don't fail the request if audit logging fails
    logger.error({ error, keyId, tenantId }, 'Failed to log API key usage');
  }
}

/**
 * Check if a set of scopes includes the required scope
 */
export function hasScope(keyScopes: string[], requiredScope: string): boolean {
  // Wildcard scope grants all access
  if (keyScopes.includes(API_KEY_SCOPES.ALL)) {
    return true;
  }

  // Check for exact match
  if (keyScopes.includes(requiredScope)) {
    return true;
  }

  // Check for resource-level wildcard (e.g., audit:* grants all audit scopes)
  const resourceType = requiredScope.split(':')[0];
  if (keyScopes.includes(`${resourceType}:*`)) {
    return true;
  }

  return false;
}

/**
 * Validate API key and check scopes
 */
export async function validateApiKey(
  rawKey: string,
  requiredScope?: string
): Promise<ApiKeyValidationResult | { error: string } | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const hash = createHash('sha256').update(rawKey).digest('hex');

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    include: { tenant: true },
  });

  if (!apiKey) {
    logger.warn({ hash: hash.substring(0, 8) }, 'API key not found');
    return null;
  }

  if (!apiKey.isActive) {
    logger.warn({ keyId: apiKey.id }, 'API key is inactive');
    await logApiKeyUsage(
      apiKey.id,
      apiKey.tenantId,
      'authenticate',
      undefined,
      false,
      'Key is inactive'
    );
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    logger.warn({ keyId: apiKey.id }, 'API key has expired');
    await logApiKeyUsage(
      apiKey.id,
      apiKey.tenantId,
      'authenticate',
      undefined,
      false,
      'Key has expired'
    );
    return null;
  }

  // Rate Limit Check
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Reset if it's a new day
  const lastReset = apiKey.lastResetAt ? new Date(apiKey.lastResetAt) : new Date(0);
  const lastResetDay = new Date(lastReset.getFullYear(), lastReset.getMonth(), lastReset.getDate());

  let currentUsage = apiKey.usageCount;
  let remaining = apiKey.rateLimitPerDay - currentUsage;

  // Calculate reset time (midnight UTC)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const resetInSeconds = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

  if (lastResetDay < today) {
    // New day - reset counter
    currentUsage = 1;
    remaining = apiKey.rateLimitPerDay - 1;

    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { usageCount: 1, lastResetAt: now, lastUsedAt: now },
      })
      .catch((err) => logger.error({ err }, 'Failed to reset API key usage'));
  } else {
    // Same day - check limit
    if (currentUsage >= apiKey.rateLimitPerDay) {
      logger.warn(
        { keyId: apiKey.id, limit: apiKey.rateLimitPerDay },
        'API key rate limit exceeded'
      );
      await logApiKeyUsage(
        apiKey.id,
        apiKey.tenantId,
        'rate_limited',
        undefined,
        false,
        `Rate limit exceeded: ${currentUsage}/${apiKey.rateLimitPerDay}`
      );

      return {
        error: 'Rate limit exceeded',
        limit: apiKey.rateLimitPerDay,
        used: currentUsage,
        remaining: 0,
        resetAt: tomorrow,
        retryAfter: resetInSeconds,
      } as ApiKeyErrorResult;
    }

    // Increment usage
    currentUsage += 1;
    remaining = apiKey.rateLimitPerDay - currentUsage;

    prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: now },
      })
      .catch((err) => logger.error({ err }, 'Failed to update API key usage'));
  }

  // Check scope if required
  if (requiredScope && !hasScope(apiKey.scopes, requiredScope)) {
    logger.warn(
      { keyId: apiKey.id, requiredScope, keyScopes: apiKey.scopes },
      'API key lacks required scope'
    );
    await logApiKeyUsage(
      apiKey.id,
      apiKey.tenantId,
      'scope_denied',
      undefined,
      false,
      `Missing scope: ${requiredScope}`
    );

    return {
      error: `Insufficient scope. Required: ${requiredScope}`,
      requiredScope,
      grantedScopes: apiKey.scopes,
    } as ApiKeyErrorResult;
  }

  // Log successful authentication
  await logApiKeyUsage(apiKey.id, apiKey.tenantId, 'authenticated', undefined, true);

  return {
    tenantId: apiKey.tenantId,
    scopes: apiKey.scopes,
    planTier: apiKey.tenant.planTier,
    keyId: apiKey.id,
    keyName: apiKey.name,
    rateLimit: {
      limit: apiKey.rateLimitPerDay,
      used: currentUsage,
      remaining: remaining,
      resetAt: tomorrow,
    },
  };
}

/**
 * Rotate API key - generates new key while keeping old one valid during grace period
 */
export async function rotateApiKey(
  keyId: string,
  gracePeriodDays: number = 7
): Promise<{ newKey: string; newHash: string; gracePeriodEndsAt: Date } | null> {
  const existingKey = await prisma.apiKey.findUnique({
    where: { id: keyId },
  });

  if (!existingKey || !existingKey.isActive) {
    return null;
  }

  // Generate new key
  const { key: newKey, hash: newHash } = generateApiKey();
  const gracePeriodEndsAt = new Date();
  gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + gracePeriodDays);

  // Create new key with same properties
  await prisma.apiKey.create({
    data: {
      tenantId: existingKey.tenantId,
      keyHash: newHash,
      keyPrefix: newKey.substring(0, 12),
      name: `${existingKey.name} (Rotated)`,
      scopes: existingKey.scopes,
      isActive: true,
      rateLimitPerDay: existingKey.rateLimitPerDay,
      expiresAt: existingKey.expiresAt,
    },
  });

  // Mark old key for expiration after grace period
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      expiresAt: gracePeriodEndsAt,
      isActive: false,
    },
  });

  logger.info(
    {
      keyId,
      oldKeyPrefix: existingKey.keyPrefix,
      newKeyPrefix: newKey.substring(0, 12),
      gracePeriodEndsAt,
    },
    'API key rotated'
  );

  return { newKey, newHash, gracePeriodEndsAt };
}

/**
 * Revoke API key immediately
 */
export async function revokeApiKey(keyId: string): Promise<boolean> {
  const result = await prisma.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  logger.info({ keyId }, 'API key revoked');

  return !!result;
}

// Minimal wrapper for public API usage ensuring we just get the tenant
export async function getTenantFromApiKey(rawKey: string) {
  const result = await validateApiKey(rawKey);
  if (!result) return null;
  if ('error' in result) return null; // Rate limited or invalid
  return { id: result.tenantId, planTier: result.planTier };
}
