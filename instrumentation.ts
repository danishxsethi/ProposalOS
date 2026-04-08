/**
 * Next.js instrumentation — runs once when the server starts.
 * Validates required environment variables before serving requests.
 *
 * P1-1 Fix: Removed the soft-skip `hasAll` guard that silently swallowed
 * validation when any var was missing. The app now crashes fast at startup
 * with a precise list of missing vars instead of failing per-request.
 *
 * Note: dotenv is imported dynamically to avoid pulling fs into Edge runtime.
 */
import { logger } from '@/lib/logger';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { config } = await import('dotenv');
    const root = process.cwd();
    config({ path: `${root}/.env` });
    config({ path: `${root}/.env.local`, override: true });

    if (process.env.SKIP_ENV_VALIDATION === 'true') {
      logger.warn('[instrumentation] SKIP_ENV_VALIDATION=true — env validation skipped');
      return;
    }

    try {
      const { validateEnv } = await import('./lib/config/validateEnv');
      validateEnv(); // Throws with the precise list of ALL missing vars
      logger.info('[instrumentation] Environment validation passed');
    } catch (error) {
      logger.error({ error }, '[instrumentation] Environment validation failed');
      // Re-throw so Next.js / Cloud Run surfaces the startup failure immediately
      // instead of booting a broken server that fails per-request.
      throw error;
    }

    // Initialize OpenTelemetry for distributed tracing
    try {
      const { initializeOpenTelemetry } = await import('./lib/observability/otel');
      initializeOpenTelemetry();
    } catch (error) {
      logger.error({ error }, '[instrumentation] OpenTelemetry initialization failed');
      // Don't throw - allow the application to start without tracing
    }
  }
}
