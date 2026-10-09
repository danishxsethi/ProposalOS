import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Email delivery is temporarily unavailable.' },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': '3600',
      },
    }
  );
}
