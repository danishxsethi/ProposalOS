/**
 * Sentry Client Configuration
 *
 * Error tracking and performance monitoring for claraud-web.
 *
 * Environment Variables Required:
 * - NEXT_PUBLIC_SENTRY_DSN: Sentry Data Source Name
 * - NEXT_PUBLIC_SENTRY_ORG: Sentry Organization
 * - NEXT_PUBLIC_SENTRY_PROJECT: Sentry Project
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Profiling
  profilesSampleRate: 0.1,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Release tracking
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,

  // Integrations
  integrations: [
    // Breadcrumbs for debugging
    Sentry.breadcrumbsIntegration({
      console: true,
      dom: true,
      fetch: true,
      history: true,
      sentry: true,
      xhr: true,
    }),
  ],

  // Ignore specific errors
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'chrome-extension://',
    'moz-extension://',

    // Network errors that are expected
    'NetworkError',
    'Network request failed',
    'Failed to fetch',

    // Random plugins/extensions
    'atomicFindClose',
    'fb_xd_fragment',

    // Other plugins
    'CanvasRenderingContext2D',
  ],

  // Deny URLs (third-party scripts)
  denyUrls: [
    // Chrome extensions
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,

    // Facebook flaky stuff
    /graph\.facebook\.com/i,
    /facebook\.com\/connect/i,

    // LocalStorage
    /localhost(:\d+)?\/\//i,
  ],

  // Before send hook for filtering
  beforeSend(event, hint) {
    // Check if it's a real error vs. noise
    const error = hint.originalException;

    // Filter out specific error messages
    if (error instanceof Error) {
      const message = error.message;

      // Ignore resize observer errors (common browser noise)
      if (message.includes('ResizeObserver')) {
        return null;
      }

      // Ignore loading chunk errors (network issues)
      if (message.includes('Loading chunk')) {
        return null;
      }

      // Ignore navigation cancelled errors
      if (message.includes('navigation cancelled')) {
        return null;
      }
    }

    return event;
  },

  // Before breadcrumb
  beforeBreadcrumb(breadcrumb) {
    // Filter out noisy breadcrumbs
    if (breadcrumb.category === 'ui.click' && breadcrumb.data?.path?.includes('script')) {
      return null;
    }
    return breadcrumb;
  },
});

// Export for use in components
export { Sentry };
