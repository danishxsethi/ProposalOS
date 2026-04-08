/**
 * Security Headers Middleware
 * 
 * Provides comprehensive security headers including:
 * - HSTS (Strict Transport Security)
 * - Content Security Policy
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - X-XSS-Protection
 * - Referrer-Policy
 * - Permissions-Policy
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export interface SecurityHeadersConfig {
  /** Enable HSTS */
  hstsEnabled?: boolean;
  /** HSTS max-age in seconds (default: 31536000 = 1 year) */
  hstsMaxAge?: number;
  /** Include subdomains in HSTS */
  hstsIncludeSubDomains?: boolean;
  /** Enable HSTS preload (submit to hstspreload.org) */
  hstsPreload?: boolean;
  /** Content Security Policy */
  contentSecurityPolicy?: string;
  /** Report URI for CSP violations */
  reportUri?: string;
}

const defaultConfig: SecurityHeadersConfig = {
  hstsEnabled: true,
  hstsMaxAge: 31536000, // 1 year
  hstsIncludeSubDomains: true,
  hstsPreload: true,
  contentSecurityPolicy: `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src 'self' https://fonts.gstatic.com;
    img-src 'self' data: https: blob:;
    connect-src 'self' https:;
    frame-ancestors 'self';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s+/g, ' ').trim(),
  reportUri: '/api/csp-report',
};

/**
 * Generate security headers based on configuration
 */
export function generateSecurityHeaders(config: SecurityHeadersConfig = {}): Record<string, string> {
  const mergedConfig = { ...defaultConfig, ...config };
  const headers: Record<string, string> = {};

  // Strict Transport Security (HSTS)
  if (mergedConfig.hstsEnabled) {
    let hstsValue = `max-age=${mergedConfig.hstsMaxAge}`;
    
    if (mergedConfig.hstsIncludeSubDomains) {
      hstsValue += '; includeSubDomains';
    }
    
    if (mergedConfig.hstsPreload) {
      hstsValue += '; preload';
    }
    
    headers['Strict-Transport-Security'] = hstsValue;
  }

  // Content Security Policy
  if (mergedConfig.contentSecurityPolicy) {
    headers['Content-Security-Policy'] = mergedConfig.contentSecurityPolicy;
  }

  // X-Frame-Options (clickjacking protection)
  headers['X-Frame-Options'] = 'SAMEORIGIN';

  // X-Content-Type-Options (MIME sniffing prevention)
  headers['X-Content-Type-Options'] = 'nosniff';

  // X-XSS-Protection (legacy XSS filter, still useful for older browsers)
  headers['X-XSS-Protection'] = '1; mode=block';

  // Referrer-Policy
  headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

  // Permissions-Policy (formerly Feature-Policy)
  headers['Permissions-Policy'] = [
    'accelerometer=()',
    'ambient-light-sensor=()',
    'autoplay=()',
    'battery=()',
    'camera=()',
    'cross-origin-isolated=()',
    'display-capture=()',
    'document-domain=()',
    'encrypted-media=()',
    'execution-while-not-rendered=()',
    'execution-while-out-of-viewport=()',
    'fullscreen=()',
    'geolocation=()',
    'gyroscope=()',
    'keyboard-map=()',
    'magnetometer=()',
    'microphone=()',
    'midi=()',
    'navigation-override=()',
    'payment=()',
    'picture-in-picture=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'sync-xhr=()',
    'usb=()',
    'web-share=()',
    'xr-spatial-tracking=()',
  ].join(', ');

  // Cache-Control for sensitive pages
  headers['Cache-Control'] = 'public, max-age=0, must-revalidate';

  // Cross-Origin headers
  headers['Cross-Origin-Opener-Policy'] = 'same-origin';
  headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  headers['Cross-Origin-Resource-Policy'] = 'same-origin';

  return headers;
}

/**
 * Middleware to apply security headers to all responses
 */
export function securityHeadersMiddleware(
  request: NextRequest,
  response: NextResponse,
  config: SecurityHeadersConfig = {}
): NextResponse {
  const headers = generateSecurityHeaders(config);

  // Apply each header to the response
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Next.js middleware export
 * This is automatically called for all requests
 */
export function middleware(request: NextRequest): NextResponse {
  // Create response if not already created
  const response = NextResponse.next();

  // Apply security headers
  return securityHeadersMiddleware(request, response, {
    hstsEnabled: process.env.NODE_ENV === 'production',
    hstsPreload: true,
  });
}

/**
 * Helper to get CSP nonce for inline scripts
 * Usage: <script nonce={getCspNonce()}>
 */
export function getCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * Widget-specific CORS headers for cross-origin embedding
 */
export function getWidgetCorsHeaders(origin?: string): Record<string, string> {
  const headers: Record<string, string> = {};

  // Allow specific origins or all origins for widget embed
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Widget-Origin, X-Tenant-ID';
  headers['Access-Control-Max-Age'] = '86400'; // 24 hours

  return headers;
}

/**
 * Validate origin for CORS requests
 */
export function isValidCorsOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;

  // Check exact matches
  if (allowedOrigins.includes(origin)) return true;

  // Check wildcard patterns
  for (const pattern of allowedOrigins) {
    if (pattern.startsWith('*.')) {
      const domain = pattern.substring(2);
      if (origin.endsWith(domain) || origin.endsWith('.' + domain)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get cache control header for different content types
 */
export function getCacheControl(contentType: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    return 'no-cache, no-store, must-revalidate';
  }

  switch (contentType) {
    case 'application/javascript':
    case 'text/css':
      // Static assets - long cache with versioning
      return 'public, max-age=31536000, immutable';

    case 'image/svg+xml':
    case 'image/png':
    case 'image/jpeg':
    case 'image/webp':
      // Images - moderate cache
      return 'public, max-age=86400, stale-while-revalidate=604800';

    case 'application/pdf':
      // PDFs - shorter cache for updates
      return 'public, max-age=3600, stale-while-revalidate=86400';

    case 'application/json':
      // API responses - no cache by default
      return 'private, no-cache, no-store, must-revalidate';

    case 'text/html':
      // HTML pages - validate on each request
      return 'public, max-age=0, must-revalidate';

    default:
      return 'public, max-age=0, must-revalidate';
  }
}

export default middleware;