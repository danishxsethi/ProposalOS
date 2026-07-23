/**
 * GET /api/widget/analytics — Get widget performance analytics.
 *
 * Requirements: 10.8
 */

import { NextResponse } from 'next/server';
import { getAnalytics } from '@/lib/widget/widgetManager';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId query param is required' }, { status: 400 });
    }

    // Default to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const start = searchParams.get('start')
      ? new Date(searchParams.get('start')!)
      : startDate;
    const end = searchParams.get('end')
      ? new Date(searchParams.get('end')!)
      : endDate;

    const analytics = await getAnalytics(tenantId, { start, end });
    return NextResponse.json(analytics);
  } catch (error) {
    console.error('[Widget Analytics]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
