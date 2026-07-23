/**
 * GET /api/platform/dashboard/clients
 * Client health: active clients, satisfaction, deliverable completion
 * Requirements: 8.2
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const history = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (29 - i));
    return {
      date: date.toISOString().split('T')[0],
      activeClients: Math.floor(40 + i * 0.5 + Math.random() * 5),
      satisfactionScore: parseFloat((4.1 + Math.random() * 0.6).toFixed(2)),
      deliverableCompletionRate: parseFloat((0.82 + Math.random() * 0.12).toFixed(3)),
    };
  });

  const clients = [
    { id: 'c1', name: 'Sunrise Plumbing', tier: 'growth', satisfactionScore: 4.8, deliverablesCompleted: 12, deliverablesTotal: 14, status: 'healthy' },
    { id: 'c2', name: 'Metro Dental', tier: 'pro', satisfactionScore: 4.2, deliverablesCompleted: 8, deliverablesTotal: 10, status: 'healthy' },
    { id: 'c3', name: 'Green Lawn Co', tier: 'starter', satisfactionScore: 3.6, deliverablesCompleted: 3, deliverablesTotal: 6, status: 'at-risk' },
    { id: 'c4', name: 'City Auto Repair', tier: 'growth', satisfactionScore: 4.5, deliverablesCompleted: 9, deliverablesTotal: 9, status: 'healthy' },
    { id: 'c5', name: 'Peak Fitness', tier: 'pro', satisfactionScore: 2.9, deliverablesCompleted: 2, deliverablesTotal: 8, status: 'churning' },
  ];

  return NextResponse.json({
    summary: {
      activeClients: 47,
      averageSatisfactionScore: 4.3,
      deliverableCompletionRate: 0.87,
      atRiskClients: 3,
      churningClients: 1,
    },
    clients,
    history,
    updatedAt: now.toISOString(),
  });
}
