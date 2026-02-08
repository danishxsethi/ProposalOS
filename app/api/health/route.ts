
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Note: This endpoint intentionally has minimal logging to reduce log noise
export async function GET() {
    try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;

        return NextResponse.json(
            { status: 'ok', database: 'connected' },
            { status: 200 }
        );
    } catch (error) {
        console.error('Health check failed:', error);
        return NextResponse.json(
            { status: 'error', database: 'disconnected', error: String(error) },
            { status: 503 }
        );
    }
}
