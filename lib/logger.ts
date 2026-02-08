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
