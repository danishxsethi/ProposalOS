/**
 * app/api/admin/hallucination-telemetry/route.ts
 *
 * Per-tenant hallucination telemetry — agency_admin or higher required. [#7]
 */
import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { withRole } from '@/lib/middleware/withRole';
import { prisma } from '@/lib/prisma';
import { computeWeeklyRate } from '@/lib/telemetry/hallucinationTelemetry';
import { getTenantId } from '@/lib/tenant/context';

async function handleGet(request: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify tenant record exists (RLS already enforces scope via withAuth context)
    const user = await prisma.user.findFirst({ where: { tenantId } });
    if (!user) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    const weeks: Array<{
      weekStart: string;
      rate: number;
      caughtHallucinations: number;
      totalClaims: number;
    }> = [];
    const today = new Date();

    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);

      const report = await computeWeeklyRate(tenantId, weekStart);
      weeks.push({
        weekStart: weekStart.toISOString(),
        rate: report.rate,
        caughtHallucinations: report.caughtHallucinations,
        totalClaims: report.totalClaims,
      });
    }

    return NextResponse.json({ weeks });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// withAuth sets tenant context via runWithTenantAsync; withRole enforces agency_admin+
export const GET = withAuth(withRole('agency_admin', handleGet));
