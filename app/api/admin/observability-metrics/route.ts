/**
 * app/api/admin/observability-metrics/route.ts
 *
 * Task 3 (Pipeline 17): GET /api/admin/observability-metrics
 *
 * Query the Metric table for LLM + audit observability data.
 *
 * Query params:
 *   name      — filter by metric name (partial match)
 *   since     — ISO date string (default: last 24 hours)
 *   agg       — 'sum' | 'avg' | 'last' (default: 'last')
 *   limit     — max rows returned (default 200, max 1000)
 */

import { NextResponse } from 'next/server';

import { verifyAdminOrCronAuth } from '@/lib/middleware/adminAuth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const authError = await verifyAdminOrCronAuth(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const nameFilter = searchParams.get('name') ?? undefined;
  const since = searchParams.get('since')
    ? new Date(searchParams.get('since')!)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const agg = (searchParams.get('agg') ?? 'last') as 'sum' | 'avg' | 'last';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000);

  try {
    const rows = await prisma.metric.findMany({
      where: {
        ...(nameFilter ? { name: { contains: nameFilter } } : {}),
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    // Aggregate by metric name
    const byName: Record<string, number[]> = {};
    for (const row of rows) {
      const name = row.name;
      if (!name) continue;
      if (!byName[name]) byName[name] = [];
      if (row.value != null) byName[name].push(row.value);
    }

    const aggregated: Record<string, number> = {};
    for (const [name, values] of Object.entries(byName)) {
      if (agg === 'sum') aggregated[name] = values.reduce((s, v) => s + v, 0);
      else if (agg === 'avg') aggregated[name] = values.reduce((s, v) => s + v, 0) / values.length;
      else aggregated[name] = values[0] ?? 0; // 'last' — rows are desc by timestamp
    }

    return NextResponse.json({
      since: since.toISOString(),
      agg,
      rowCount: rows.length,
      aggregated,
      rawRows: agg === 'last' ? rows.slice(0, 50) : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
