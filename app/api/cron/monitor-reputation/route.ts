import { NextResponse } from 'next/server';

import { verifyCronAuth } from '@/lib/middleware/cronAuth';
import { monitorReputation } from '@/lib/monitoring/reputationMonitor';

export const maxDuration = 300; // 5 minutes

export async function GET(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  try {
    await monitorReputation();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reputation Monitor Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
