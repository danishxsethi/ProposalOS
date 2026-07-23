import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import packageJson from '../../../package.json';

const version = packageJson.version;

/**
 * Health check endpoint for Cloud Run liveness/readiness probes.
 * Returns 200 when DB is reachable, 503 otherwise.
 */
export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;

        return NextResponse.json(
            {
                status: 'ok',
                database: 'connected',
                timestamp: new Date().toISOString(),
                version,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Health check failed:', error);
        return NextResponse.json(
            {
                status: 'error',
                database: 'disconnected',
                timestamp: new Date().toISOString(),
                version,
                error: String(error),
            },
            { status: 503 }
        );
    }
}
