/**
 * NeverBounce Email Validator (Fix 4B)
 *
 * Wraps the NeverBounce API to verify whether a prospect email is safe to send to.
 * Integrates with the `validate_email` node in `email-sequence-graph.ts`.
 *
 * Documentation: https://neverbounce.com/api/v4/
 */

import { logger } from '@/lib/logger';

export type NeverBounceResult =
    | 'valid'          // Email is deliverable
    | 'invalid'        // Email is undeliverable / hard bounce
    | 'disposable'     // Temporary/throw-away inbox
    | 'catchall'       // Domain accepts all email — risky, use with caution
    | 'unknown';       // Could not determine

export interface NeverBounceVerification {
    email: string;
    result: NeverBounceResult;
    flags: string[];
    isSafe: boolean;
    response?: any;
}

const NEVERBOUNCE_API_URL = 'https://api.neverbounce.com/v4/single/check';

/**
 * Verifies whether a single email address is deliverable via the NeverBounce API.
 * Falls back to `unknown` if the API key is not configured or if the call fails.
 */
export async function verifyEmail(email: string): Promise<NeverBounceVerification> {
    const apiKey = process.env.NEVERBOUNCE_API_KEY;

    // Graceful degradation: if no API key, log a warning and return unknown result
    if (!apiKey) {
        logger.warn({ email }, 'NEVERBOUNCE_API_KEY not configured — skipping email verification, assuming valid');
        return {
            email,
            result: 'unknown',
            flags: ['api_key_missing'],
            isSafe: true,   // Optimistic: proceed without validation when key is absent
        };
    }

    try {
        const url = new URL(NEVERBOUNCE_API_URL);
        url.searchParams.set('key', apiKey);
        url.searchParams.set('email', email);
        url.searchParams.set('address_info', '1');
        url.searchParams.set('credits_info', '0');

        const resp = await fetch(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8000), // 8-second timeout
        });

        if (!resp.ok) {
            throw new Error(`NeverBounce API error: ${resp.status} ${resp.statusText}`);
        }

        const data = await resp.json();

        if (data.status !== 'success') {
            throw new Error(`NeverBounce returned non-success status: ${data.status}`);
        }

        const result = (data.result ?? 'unknown') as NeverBounceResult;
        const flags: string[] = data.flags ?? [];

        // We consider sending safe if the result is 'valid' or 'catchall'
        // 'invalid' and 'disposable' are hard blocks
        const isSafe = result === 'valid' || result === 'catchall' || result === 'unknown';

        logger.info({ email, result, flags, isSafe }, 'NeverBounce verification complete');

        return { email, result, flags, isSafe, response: data };

    } catch (err) {
        // Log the error but don't crash the pipeline — return unknown/optimistic
        logger.error({ email, err }, 'NeverBounce verification failed — proceeding optimistically');
        return {
            email,
            result: 'unknown',
            flags: ['verification_error'],
            isSafe: true,
        };
    }
}

/**
 * Checks the blocklist table in DB before sending.
 * Useful even without NeverBounce credentials.
 */
export async function isEmailBlocked(email: string): Promise<boolean> {
    try {
        const { prisma } = await import('@/lib/prisma');
        const blocked = await prisma.emailBlocklist.findUnique({ where: { email } });
        return !!blocked;
    } catch {
        return false;
    }
}
