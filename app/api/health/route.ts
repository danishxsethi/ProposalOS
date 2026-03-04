import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import packageJson from '../../../package.json';

const version = packageJson.version;

/**
 * Health check endpoint for Cloud Run liveness/readiness probes.
 * Returns 200 when DB is reachable, 503 otherwise.
 */
export async function GET() {
    const checks = {
        database: false,
        llm: false,
    };

    // Database
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = true;
    } catch (e) {
        checks.database = false;
    }

    // LLM API (lightweight check)
    try {
        checks.llm = !!process.env.GOOGLE_AI_API_KEY;
    } catch (e) {
        checks.llm = false;
    }

    const healthy = Object.values(checks).every(Boolean);
    return NextResponse.json(
        {
            status: healthy ? 'healthy' : 'degraded',
            checks,
            timestamp: new Date().toISOString(),
            version
        },
        { status: healthy ? 200 : 503 }
    );
}
