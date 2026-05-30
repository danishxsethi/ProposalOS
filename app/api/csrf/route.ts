import { NextResponse } from 'next/server';

import { createCsrfResponse } from '@/lib/security/csrf';

export async function GET() {
  const { token, cookieHeader } = createCsrfResponse();

  const response = NextResponse.json({ csrfToken: token });
  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}
export const dynamic = 'force-dynamic';
