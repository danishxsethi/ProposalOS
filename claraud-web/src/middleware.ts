import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import NextAuth from 'next-auth';

import { authConfig } from '@/lib/auth/auth.config';

const publicRoutes = [
  '/',
  '/scan',
  '/pricing',
  '/agencies',
  '/blog',
  '/login',
  '/register',
  '/about',
];

const publicPrefixes = [
  '/scan/',
  '/report/',
  '/proposal/',
  '/presentation/',
  '/api/og/',
  '/api/lead',
  '/api/health',
  '/api/scan',
  '/industries/',
  '/legal/',
];

export default NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    publicRoutes.includes(pathname) || publicPrefixes.some((p) => pathname.startsWith(p));

  if (!isPublic && !req.auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Tenant context header injection for API routes
  if ((req.auth?.user as any)?.tenantId) {
    const headers = new Headers(req.headers);
    headers.set('x-tenant-id', (req.auth!.user as any).tenantId);
    return NextResponse.next({ headers });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
