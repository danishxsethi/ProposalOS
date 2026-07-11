import { NextRequest, NextResponse } from 'next/server';

import { handlers } from '@/lib/auth';
import { checkRateLimit } from '@/lib/middleware/rateLimit';

export const { GET } = handlers;

/**
 * P1-15: distributed rate limiting on the credentials login path specifically —
 * before bcrypt password verification runs. Registration already had this
 * (app/api/auth/register/route.ts); login did not.
 *
 * Scoped to the credentials callback path only so OAuth provider callbacks
 * (/api/auth/callback/google, etc.) are never affected.
 *
 * Two independent limits (either can block the request):
 *  - per-IP: caps distributed credential-stuffing from a single source.
 *  - per-account (normalized email): caps targeted brute force against one account,
 *    even from many different IPs.
 * The account limit does not reveal whether the account exists — the same 429 response
 * is returned regardless, and a wrong-but-well-formed email is hashed identically to a
 * real one.
 */
async function checkCredentialsLoginRateLimit(req: Request): Promise<NextResponse | null> {
  let email: string | undefined;
  try {
    const clone = req.clone();
    const contentType = clone.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await clone.json();
      email = typeof body?.email === 'string' ? body.email : undefined;
    } else {
      const form = await clone.formData();
      const value = form.get('email');
      email = typeof value === 'string' ? value : undefined;
    }
  } catch {
    // Body not readable/parseable as expected — fall back to IP-only limiting below.
  }

  const windowMs = 15 * 60 * 1000;
  const max = 10;

  const ipResult = await checkRateLimit(req, {
    windowMs,
    max,
    failClosed: true,
    routeClass: 'auth.credentials.login',
    auditOnBlock: true,
  });

  const accountResult = email
    ? await checkRateLimit(req, {
        windowMs,
        max,
        failClosed: true,
        sessionId: `login:${email.trim().toLowerCase()}`,
        routeClass: 'auth.credentials.login.account',
        auditOnBlock: true,
      })
    : { success: true, remaining: max, resetAt: new Date() };

  const blocked = !ipResult.success ? ipResult : !accountResult.success ? accountResult : null;

  if (blocked) {
    const retryAfter = blocked.retryAfter ?? Math.ceil(windowMs / 1000);
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  return null;
}

export async function POST(req: NextRequest) {
  const pathname = new URL(req.url).pathname;
  const isCredentialsLogin = pathname.endsWith('/callback/credentials');

  if (isCredentialsLogin) {
    const limited = await checkCredentialsLoginRateLimit(req);
    if (limited) return limited;
  }

  return handlers.POST(req);
}
