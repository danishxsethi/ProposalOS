import { NextResponse } from 'next/server';

import NextAuth from 'next-auth';

import { authConfig } from '@/lib/auth.config';
import { buildCspHeader, SECURITY_HEADERS, getCorsConfig, generateNonce } from '@/lib/config/security';
import { resolveTracingHeaders } from '@/lib/observability/ids';

export default NextAuth(authConfig).auth((req) => {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';
  const origin = req.headers.get('origin');
  const tracing = resolveTracingHeaders({
    correlationId: req.headers.get('x-correlation-id'),
    traceId: req.headers.get('x-trace-id'),
    traceparent: req.headers.get('traceparent'),
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-correlation-id', tracing.correlationId);
  requestHeaders.set('x-trace-id', tracing.traceId);
  requestHeaders.set('traceparent', tracing.traceparent);

  // Define allowed system domains (localhost, vercel.app, etc.)
  const currentHost = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : 'localhost:3000';

  // Check if Custom Domain
  const isCustomDomain =
    hostname !== currentHost &&
    !hostname.endsWith('.vercel.app') &&
    !hostname.includes('localhost');

  // Generate CSP nonce for this request
  const nonce = generateNonce();

  // Create response
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('X-Correlation-Id', tracing.correlationId);
  response.headers.set('X-Trace-Id', tracing.traceId);
  response.headers.set('traceparent', tracing.traceparent);

  // ==========================================
  // SECURITY HEADERS
  // ==========================================

  // Content Security Policy with nonce
  const cspHeader = buildCspHeader(nonce);
  response.headers.set('Content-Security-Policy', cspHeader);
  
  // Store nonce for use in components (via header for server components)
  response.headers.set('x-csp-nonce', nonce);

  // OWASP Security Headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // ==========================================
  // CORS HANDLING
  // ==========================================

  // Handle CORS for API routes
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const corsConfig = getCorsConfig(origin);

    if (corsConfig.allowed) {
      response.headers.set('Access-Control-Allow-Origin', origin || '');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-API-Key, x-csrf-token, X-Correlation-Id, X-Trace-Id, traceparent'
      );
      response.headers.set('Access-Control-Max-Age', '86400');
    }
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    const corsConfig = getCorsConfig(origin);

    if (corsConfig.allowed) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || '',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, X-API-Key, x-csrf-token, X-Correlation-Id, X-Trace-Id, traceparent',
          'Access-Control-Max-Age': '86400',
          'X-Correlation-Id': tracing.correlationId,
          'X-Trace-Id': tracing.traceId,
          traceparent: tracing.traceparent,
        },
      });
    }

    // Block disallowed origins
    return new NextResponse(null, { status: 403 });
  }

  // ==========================================
  // CUSTOM DOMAIN HANDLING
  // ==========================================

  if (isCustomDomain) {
    // Pass custom domain as header for tenant resolution
    response.headers.set('x-custom-domain', hostname);
  }

  return response;
});

export const config = {
  // Apply to all routes except static files and images
  matcher: ['/((?!_next/static|_next/image|.*\\.png$).*)'],
};
