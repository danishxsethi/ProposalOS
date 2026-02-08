import { NextResponse } from 'next/server';
import { clearCache } from '@/lib/cache/apiCache';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
    try {
        const authHeader = request.headers.get('x-admin-key');
        // Simple admin protection for now, or rely on internal network
        // For MVP, we'll just check for a secret if env var is set, or proceed
        if (process.env.ADMIN_SECRET && authHeader !== process.env.ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await clearCache();
        logger.info('Cache cleared via API');

        return NextResponse.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
        logger.error({ err: error }, 'Failed to clear cache');
        return NextResponse.json({ error: 'Failed to clear cache' }, { status: 500 });
    }
}
