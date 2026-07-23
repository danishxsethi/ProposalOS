import { NextResponse } from 'next/server';
import { getMoatReport } from '@/lib/platform/metrics/moatMetrics';
import {
  checkNegativeTrends,
  estimateCatchUpTime,
  getAlertLog,
  type CompetitorBaseline,
} from '@/lib/platform/metrics/moatAlerting';

// Static competitor baselines for catch-up time estimates (Requirement 20.8)
const COMPETITOR_BASELINES: Record<string, CompetitorBaseline> = {
  data:    { currentValue: 50_000,  weeklyGrowthRate: 0.03 },
  speed:   { currentValue: 8_000,   weeklyGrowthRate: 0.02 },
  cost:    { currentValue: 25,      weeklyGrowthRate: 0.015 },
  network: { currentValue: 10,      weeklyGrowthRate: 0.04 },
  brand:   { currentValue: 50,      weeklyGrowthRate: 0.025 },
};

export async function GET() {
  try {
    const report = await getMoatReport();
    const negativeTrends = checkNegativeTrends(report);
    const activeAlerts = getAlertLog();

    const catchUpTimes: Record<string, number> = {};
    for (const metric of ['data', 'speed', 'cost', 'network', 'brand'] as const) {
      catchUpTimes[metric] = estimateCatchUpTime(
        metric,
        COMPETITOR_BASELINES[metric],
        report
      );
    }

    return NextResponse.json({
      report,
      negativeTrends,
      activeAlerts,
      catchUpTimes,
    });
  } catch (err) {
    console.error('[/api/admin/moats]', err);
    return NextResponse.json({ error: 'Failed to load moat data' }, { status: 500 });
  }
}
