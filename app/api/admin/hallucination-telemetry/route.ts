import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { computeWeeklyRate } from '@/lib/telemetry/hallucinationTelemetry';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tenant
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
      include: { tenant: true },
    });

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'No tenant found' }, { status: 404 });
    }

    // Get trailing 12 weeks of data
    const weeks: any[] = [];
    const today = new Date();

    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Set to Monday

      const report = await computeWeeklyRate(user.tenantId, weekStart);
      weeks.push({
        weekStart: weekStart.toISOString(),
        rate: report.rate,
        caughtHallucinations: report.caughtHallucinations,
        totalClaims: report.totalClaims,
      });
    }

    return NextResponse.json({ weeks });
  } catch (error) {
    console.error('Failed to get hallucination telemetry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
