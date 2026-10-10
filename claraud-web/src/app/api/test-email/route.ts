import { NextResponse } from 'next/server';

export async function GET() {
  return new NextResponse(null, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}
