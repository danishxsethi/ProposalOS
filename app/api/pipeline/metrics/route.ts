/**
 * Pipeline Metrics API
 * 
 * GET: Retrieve real-time pipeline metrics for the authenticated tenant
 * 
 * Requirements: 10.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMetrics } from '@/lib/pipeline/metrics';

/**
 * GET /api/pipeline/metrics
 * Get real-time pipeline metrics
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.tenantId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get date range from query params (default: last 7 days)
    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get('days') || '7');
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const metrics = await getMetrics(session.user.tenantId, {
      start: startDate,
      end: endDate,
    });

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error fetching pipeline metrics:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
