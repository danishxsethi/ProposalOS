
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

export const API_KEY_PREFIX = 'pe_live_';

export function generateApiKey() {
    const random = randomBytes(24).toString('hex'); // 48 chars
    const key = `${API_KEY_PREFIX}${random}`;
    const hash = createHash('sha256').update(key).digest('hex');
    const prefix = key.substring(0, 12); // pe_live_XXXX
    return { key, hash, prefix };
}


export async function validateApiKey(rawKey: string) {
    if (!rawKey.startsWith(API_KEY_PREFIX)) {
        return null;
    }

    const hash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash: hash },
        include: { tenant: true }
    });

    if (!apiKey) return null;
    if (!apiKey.isActive) return null;
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Rate Limit Check
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of day

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
        currentUsage = 1; // Count this request
        remaining = apiKey.rateLimitPerDay - 1;

        // Reset counter in DB (async, don't block)
        prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { usageCount: 1, lastResetAt: now, lastUsedAt: now }
        }).catch(err => console.error('Failed to reset API key usage', err));
    } else {
        // Same day - check limit
        if (currentUsage >= apiKey.rateLimitPerDay) {
            // Rate limit exceeded - return error with metadata
            return {
                error: 'Rate limit exceeded',
                limit: apiKey.rateLimitPerDay,
                used: currentUsage,
                remaining: 0,
                resetAt: tomorrow,
                retryAfter: resetInSeconds
            };
        }

        // Increment usage
        currentUsage += 1;
        remaining = apiKey.rateLimitPerDay - currentUsage;

        prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { usageCount: { increment: 1 }, lastUsedAt: now }
        }).catch(err => console.error('Failed to update API key usage', err));
    }

    return {
        tenantId: apiKey.tenantId,
        scopes: apiKey.scopes,
        planTier: apiKey.tenant.planTier,
        // Rate limit metadata
        rateLimit: {
            limit: apiKey.rateLimitPerDay,
            used: currentUsage,
            remaining: remaining,
            resetAt: tomorrow
        }
    };
}

// Minimal wrapper for public API usage ensuring we just get the tenant
export async function getTenantFromApiKey(rawKey: string) {
    const result = await validateApiKey(rawKey);
    if (!result) return null;
    if ('error' in result) return null; // Rate limited or invalid
    return { id: result.tenantId, planTier: result.planTier };
}
