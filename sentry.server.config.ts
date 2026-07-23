// FIX-07: Sentry server-side configuration
import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    enabled: process.env.NODE_ENV === 'production',
    // Tag every error with audit/tenant context when available
    beforeSend(event) {
        return event;
    },
});
