/**
 * Next.js instrumentation — runs once when the server starts.
 * Validates required environment variables before serving requests.
 * Note: dotenv is imported dynamically to avoid pulling fs into Edge runtime.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { config } = await import('dotenv');
        const root = process.cwd();
        config({ path: `${root}/.env` });
        config({ path: `${root}/.env.local`, override: true });
        if (process.env.SKIP_ENV_VALIDATION === 'true') {
            console.warn('⚠️  SKIP_ENV_VALIDATION=true: env validation skipped');
            return;
        }
        // Skip validation when ANY required var is missing (e.g. Cloud Run with partial config)
        // App will start; endpoints that need vars will fail with clear errors
        const required = [
            'DATABASE_URL',
            'API_KEY',
            'GOOGLE_PAGESPEED_API_KEY',
            'GOOGLE_PLACES_API_KEY',
            'SERP_API_KEY',
            'GCP_PROJECT_ID',
            'GOOGLE_AI_API_KEY',
        ];
        const hasAll = required.every((v) => process.env[v]?.trim());
        if (!hasAll) {
            console.warn('⚠️  Missing required env vars: validation skipped (set secrets for full functionality)');
            return;
        }
        const { validateEnv } = await import('./lib/config/validateEnv');
        validateEnv();
    }
}
