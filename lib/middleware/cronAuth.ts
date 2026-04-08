import { NextRequest, NextResponse } from 'next/server';

/**
 * Shared cron authentication helper.
 *
 * P0-B Fix: The old inline guard `if (CRON_SECRET && authHeader !== ...)` was broken —
 * if CRON_SECRET was unset, the `&&` short-circuited and the guard was never evaluated,
 * allowing unauthenticated access to all cron endpoints.
 *
 * This helper:
 *   - Returns HTTP 500 if CRON_SECRET is not configured (server misconfiguration)
 *   - Returns HTTP 401 if the Authorization header does not match
 *   - Returns null if authentication passes (caller should proceed)
 *
 * Usage:
 *   const authError = verifyCronAuth(req);
 *   if (authError) return authError;
 */
export function verifyCronAuth(req: Request | NextRequest): NextResponse | null {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('[CRON] FATAL: CRON_SECRET environment variable is not set');
        return NextResponse.json(
            { error: 'Server misconfiguration: CRON_SECRET not set' },
            { status: 500 }
        );
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return null; // Auth passed
}
