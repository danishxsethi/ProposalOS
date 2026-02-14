/**
 * Next.js instrumentation — runs once when the server starts.
 * Validates required environment variables before serving requests.
 */
import { config } from 'dotenv';

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const root = process.cwd();
        config({ path: `${root}/.env` });
        config({ path: `${root}/.env.local`, override: true });
        if (process.env.SKIP_ENV_VALIDATION === 'true') {
            console.warn('⚠️  SKIP_ENV_VALIDATION=true: env validation skipped');
            return;
        }
        const { validateEnv } = await import('./lib/config/validateEnv');
        validateEnv();
    }
}
