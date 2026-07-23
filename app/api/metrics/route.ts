import { NextResponse } from 'next/server';
import { Metrics } from '@/lib/metrics';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic'; // Metrics change on every request

export async function GET() {
    const data = Metrics.get();

    // Also log current metrics as a structured event
    logger.info({
        event: 'metrics.snapshot',
        metrics: data
    }, 'Metrics snapshot');

    return NextResponse.json({
        metrics: data,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
}
