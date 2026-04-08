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
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { config } = await import('dotenv');
        const root = process.cwd();
        config({ path: `${root}/.env` });
        config({ path: `${root}/.env.local`, override: true });

        if (process.env.SKIP_ENV_VALIDATION === 'true') {
            console.warn('[instrumentation] SKIP_ENV_VALIDATION=true — env validation skipped');
            return;
        }

        try {
            const { validateEnv } = await import('./lib/config/validateEnv');
            validateEnv(); // Throws with the precise list of ALL missing vars
            console.log('[instrumentation] ✅ Environment validation passed');
        } catch (error) {
            console.error('[instrumentation] ❌ Environment validation failed:', error);
            // Re-throw so Next.js / Cloud Run surfaces the startup failure immediately
            // instead of booting a broken server that fails per-request.
            throw error;
        }
    }
}
