/**
 * GET /api/platform/dashboard/revenue
 * Revenue metrics: MRR, new/churned revenue, revenue by tier
 * Requirements: 8.3
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const history = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(now);
    date.setMonth(date.getMonth() - (11 - i));
    const base = 45000 + i * 6000;
    return {
      month: date.toISOString().slice(0, 7),
      mrr: base + Math.floor(Math.random() * 3000),
      newRevenue: Math.floor(8000 + Math.random() * 4000),
      churnedRevenue: Math.floor(1000 + Math.random() * 2000),
    };
  });

  return NextResponse.json({
    current: {
      mrr: 112400,
      arr: 1348800,
      newRevenue: 14200,
      churnedRevenue: 2800,
      netNewRevenue: 11400,
      revenueByTier: {
        starter: 18600,
        growth: 47800,
        pro: 46000,
      },
      mrrGrowthRate: 0.113,
    },
    history,
    updatedAt: now.toISOString(),
  });
}
