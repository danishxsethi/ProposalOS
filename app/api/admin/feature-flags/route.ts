import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

// Simple in-memory cache to represent the values until the next application restart
// In a full implementation, you might use a global state or Redis cache.
let flagsCache: Record<string, string> | null = null;
let lastCacheUpdate = 0;

async function getMergedFlags() {
    const now = Date.now();
    if (flagsCache && now - lastCacheUpdate < 60000) {
        return flagsCache;
    }

    try {
        const dbFlags = await prisma.featureFlag.findMany();
        const merged = { ...FEATURE_FLAGS } as any;

        for (const flag of dbFlags) {
            if (flag.value === 'true' || flag.value === 'false') {
                merged[flag.key] = flag.value === 'true';
            } else if (!isNaN(Number(flag.value))) {
                merged[flag.key] = parseInt(flag.value, 10);
            } else {
                merged[flag.key] = flag.value;
            }
        }

        flagsCache = merged;
        lastCacheUpdate = now;
        return merged;
    } catch (err) {
        // Fallback to env vars if DB is unavailable
        return FEATURE_FLAGS;
    }
}

export async function GET(request: Request) {
    const flags = await getMergedFlags();
    return NextResponse.json({ success: true, flags });
}

export async function POST(request: Request) {
    const adminKey = request.headers.get('authorization')?.replace('Bearer ', '');
    if (adminKey !== process.env.MASTER_API_KEY) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { key, value } = body;

        if (!key || value === undefined) {
            return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
        }

        const flag = await prisma.featureFlag.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) },
        });

        // Invalidate cache immediately on write
        flagsCache = null;

        return NextResponse.json({ success: true, flag });
    } catch (err: any) {
        console.error('Feature Flag Update Error:', err);
        return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 });
    }
}
