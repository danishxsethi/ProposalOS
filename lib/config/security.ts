/**
 * lib/config/security.ts
 *
 * Security Configuration
 *
 * Centralized configuration for security settings including:
 * - CORS allowed origins
 * - CSP policy
 * - Security headers
 * - Rate limiting thresholds
 */

import { randomBytes } from 'crypto';

// Allowed origins for CORS (comma-separated in env var)
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

// Widget embed allowed origins (for tenant custom domains)
export const WIDGET_ALLOWED_ORIGINS = process.env.WIDGET_ALLOWED_ORIGINS
  ? process.env.WIDGET_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [];

/**
 * Generate a cryptographically secure nonce for CSP
 * @returns Base64-encoded nonce string
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Build Content Security Policy with nonce support
 * @param nonce - Optional nonce value for script/style-src
 * @returns CSP header string
 */
export function buildCspHeader(nonce?: string): string {
  const scriptSrc = [
    "'self'",
    nonce ? `'nonce-${nonce}'` : undefined,
    'https://cdn.jsdelivr.net', // For widget
    'https://www.googletagmanager.com', // Google Analytics
    'https://js.posthog.com', // PostHog
  ].filter(Boolean) as string[];

  const styleSrc = [
    "'self'",
    nonce ? `'nonce-${nonce}'` : undefined,
    'https://fonts.googleapis.com', // Google Fonts
  ].filter(Boolean) as string[];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    'style-src': styleSrc,
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      'https://api.posthog.com',
      'https://*.posthog.com',
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.vercel.app',
      'wss://*.vercel.app',
    ],
    'frame-src': ["'self'", 'https://js.stripe.com'],
    'frame-ancestors': [
      "'self'",
      ...(WIDGET_ALLOWED_ORIGINS.length > 0 ? WIDGET_ALLOWED_ORIGINS : []),
    ],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'upgrade-insecure-requests': [],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => {
      if (sources.length === 0) return `${directive};`;
      return `${directive} ${sources.join(' ')};`;
    })
    .join(' ');
}

// Legacy CSP directives for backward compatibility (deprecated - use buildCspHeader with nonce)
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://www.googletagmanager.com',
    'https://js.posthog.com',
  ],
  'style-src': [
    "'self'",
    'https://fonts.googleapis.com',
  ],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'connect-src': [
    "'self'",
    'https://api.posthog.com',
    'https://*.posthog.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
    'https://*.vercel.app',
    'wss://*.vercel.app',
  ],
  'frame-src': ["'self'", 'https://js.stripe.com'],
  'frame-ancestors': [
    "'self'",
    ...(WIDGET_ALLOWED_ORIGINS.length > 0 ? WIDGET_ALLOWED_ORIGINS : []),
  ],
  'form-action': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'upgrade-insecure-requests': [],
};

// Security headers configuration
export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Clickjacking protection
  'X-Frame-Options': 'SAMEORIGIN',

  // Force HTTPS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy (formerly Feature-Policy)
  'Permissions-Policy': [
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
    'payment=(self "https://js.stripe.com")',
    'picture-in-picture=()',
    'publickey-credentials-get=()',
    'screen-wake-lock=()',
    'sync-xhr=()',
    'usb=()',
    'web-share=()',
    'xr-spatial-tracking=()',
  ].join(', '),

  // Cross-Origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',

  // Cache control for sensitive pages
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

// Rate limiting configuration per tier
export const RATE_LIMITS = {
  free: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000,
  },
  starter: {
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 5000,
  },
  pro: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
  },
  agency: {
    requestsPerMinute: 120,
    requestsPerHour: 2000,
    requestsPerDay: 50000,
  },
};

// Password policy
export const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
};

// Session configuration
export const SESSION_CONFIG = {
  maxAge: 60 * 60, // 1 hour
  updateAge: 60 * 30, // Update session every 30 minutes of activity
  absoluteMaxAge: 24 * 60 * 60, // 24 hours absolute max
};

// API key configuration
export const API_KEY_CONFIG = {
  prefix: 'pe_live_',
  minLength: 32,
  defaultRateLimitPerDay: 1000,
  rotationGracePeriodDays: 7,
  maxKeysPerTenant: 10,
};

// Audit logging configuration
export const AUDIT_LOG_CONFIG = {
  enabled: true,
  retentionDays: 90,
  logAuthentication: true,
  logAuthorization: true,
  logDataAccess: true,
  logDataModification: true,
  sensitiveFields: ['password', 'token', 'apiKey', 'secret'],
};

// CORS configuration helper
export function getCorsConfig(origin: string | null): {
  allowed: boolean;
  isWidgetDomain: boolean;
} {
  if (!origin) {
    return { allowed: false, isWidgetDomain: false };
  }

  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);
  const isWidgetOrigin = WIDGET_ALLOWED_ORIGINS.includes(origin);

  return {
    allowed: isAllowedOrigin || isWidgetOrigin,
    isWidgetDomain: isWidgetOrigin,
  };
}

export default {
  ALLOWED_ORIGINS,
  WIDGET_ALLOWED_ORIGINS,
  CSP_DIRECTIVES,
  buildCspHeader,
  SECURITY_HEADERS,
  RATE_LIMITS,
  PASSWORD_POLICY,
  SESSION_CONFIG,
  API_KEY_CONFIG,
  AUDIT_LOG_CONFIG,
  getCorsConfig,
};
