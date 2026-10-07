import { NextResponse } from 'next/server';

/** Process-only liveness probe for container and load-balancer health checks. */
export async function GET(): Promise<NextResponse<{ status: string; timestamp: string }>> {
  return NextResponse.json({ status: 'alive', timestamp: new Date().toISOString() });
}
