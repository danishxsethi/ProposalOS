import pino from 'pino';

// Pretty printing for local development
const isDev = process.env.NODE_ENV !== 'production';

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
    formatters: {
        level: (label) => {
            return { level: label };
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
        return !noisyPaths.some(noisyPath => pathname.startsWith(noisyPath));
    } catch {
        // If URL parsing fails, log it to be safe
        return true;
    }
};

// Helper to sanitize error objects for logging
export const logError = (msg: string, error: unknown, context: Record<string, any> = {}) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error({
        msg,
        error: err.message,
        stack: err.stack,
        ...context,
    });
};
