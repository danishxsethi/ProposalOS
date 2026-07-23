/**
 * GET /api/platform/dashboard/metrics
 * Pipeline metrics: prospects, audits, proposals, emails, conversion rate
 * Requirements: 8.1
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Stub data — replace with real DB queries when available
  const now = new Date();
  const history = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (29 - i));
    return {
      date: date.toISOString().split('T')[0],
      prospectsDiscovered: Math.floor(80 + Math.random() * 40),
      auditsCompleted: Math.floor(60 + Math.random() * 30),
      proposalsGenerated: Math.floor(20 + Math.random() * 15),
      emailsSent: Math.floor(40 + Math.random() * 20),
    };
  });

  return NextResponse.json({
    current: {
      prospectsDiscovered: 312,
      auditsCompleted: 287,
      proposalsGenerated: 94,
      emailsSent: 156,
      conversionRate: 0.062,
      openRate: 0.41,
      replyRate: 0.12,
    },
    history,
    updatedAt: now.toISOString(),
  });
}
