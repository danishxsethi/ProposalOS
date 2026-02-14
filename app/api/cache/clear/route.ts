import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { clearCache } from '@/lib/cache/apiCache';
import { logger } from '@/lib/logger';

function secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
    try {
        const adminSecret = process.env.ADMIN_SECRET;
        if (!adminSecret) {
            return NextResponse.json(
                { error: 'Admin endpoint not configured' },
                { status: 503 }
            );
        }

        const providedKey = request.headers.get('x-admin-key') ?? request.headers.get('x-admin-secret');
        const bearerToken = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
        const effectiveKey = providedKey || bearerToken;
        if (!effectiveKey || !secureCompare(effectiveKey, adminSecret)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await clearCache();
        logger.warn({ clearedBy: 'admin' }, 'cache.cleared');

        return NextResponse.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
        logger.error({ err: error }, 'Failed to clear cache');
        return NextResponse.json({ error: 'Failed to clear cache' }, { status: 500 });
    }
}
