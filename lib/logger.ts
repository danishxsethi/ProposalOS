import pino from 'pino';

import { getObservabilityContext } from '@/lib/observability/context';
import { PiiScrubber } from '@/lib/security/piiScrubber';

// Pretty printing for local development
const isDev = process.env.NODE_ENV !== 'production';

const REDACTED = '[REDACTED]';
const URL_REDACTED = '[URL_REDACTED]';
const SCRUBBED_KEY_PATTERNS = [
  /(^|\.)(businessName|businessUrl|targetUrl|websiteUrl|url|sourceUrl|proposalUrl|pdfUrl|webhookUrl)$/i,
  /(^|\.)(findings?|rawResponse|prompt|input|output|content|emailBody|recipientEmail|prospectEmail)$/i,
];

function sanitizeString(value: string): string {
  const piiResult = PiiScrubber.redactPII(value);
  return piiResult.redacted.replace(/https?:\/\/[^\s]+/gi, URL_REDACTED);
}

function shouldScrubKey(path: string): boolean {
  return SCRUBBED_KEY_PATTERNS.some((pattern) => pattern.test(path));
}

function sanitizeValue(value: unknown, path: string = ''): unknown {
  if (value == null) return value;

  if (typeof value === 'string') {
    return shouldScrubKey(path) ? REDACTED : sanitizeString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: isDev ? sanitizeString(value.stack || '') : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeValue(entry, `${path}[${index}]`));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => {
        const nextPath = path ? `${path}.${key}` : key;
        return [key, shouldScrubKey(nextPath) ? REDACTED : sanitizeValue(nestedValue, nextPath)];
      })
    );
  }

  return value;
}

// Configure logger
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname', // Keep logs clean
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
  base: undefined, // Don't include pid and hostname in production
  mixin() {
    const context = getObservabilityContext();
    if (!context) return {};

    return {
      correlationId: context.correlationId,
      traceId: context.traceId,
      spanId: context.spanId,
      traceparent: context.traceparent,
      tenantId: context.tenantId,
      actorId: context.actorId,
      auditId: context.auditId,
      proposalId: context.proposalId,
      workflow: context.workflow,
      method: context.method,
      path: context.path,
      service: context.service,
    };
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
    log: (object) => sanitizeValue(object) as Record<string, unknown>,
  },
  hooks: {
    logMethod(args, method) {
      const sanitizedArgs = args.map((arg, index) => {
        if (typeof arg === 'string') {
          return sanitizeString(arg);
        }

        return sanitizeValue(arg, index === 0 ? '' : `arg${index}`);
      });

      method.apply(this, sanitizedArgs as Parameters<typeof method>);
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Determines if a request should be logged based on its path
 * Filters out noisy endpoints to reduce log clutter
 *
 * @param url - The request URL or path
 * @returns true if the request should be logged, false otherwise
 */
export const shouldLog = (url: string): boolean => {
  const noisyPaths = [
    '/api/health',
    '/api/ping',
    '/_next/static',
    '/_next/image',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
  ];

  try {
    const pathname = url.includes('://') ? new URL(url).pathname : url;
    return !noisyPaths.some((noisyPath) => pathname.startsWith(noisyPath));
  } catch {
    // If URL parsing fails, log it to be safe
    return true;
  }
};

// Helper to sanitize error objects for logging
export const logError = (msg: string, error: unknown, context: Record<string, any> = {}) => {
  const err = error instanceof Error ? error : new Error(String(error));
  const sanitizedContext = sanitizeValue(context);
  logger.error({
    msg,
    error: err,
    ...(sanitizedContext && typeof sanitizedContext === 'object' ? sanitizedContext : {}),
  });
};

export const sanitizeForLogs = <T>(value: T): T => sanitizeValue(value) as T;
