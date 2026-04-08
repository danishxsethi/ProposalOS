const REQUIRED_ENV_VARS = [
    // ─── Core ──────────────────────────────────────────────────────────────────
    'DATABASE_URL',
    'API_KEY',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'BASE_URL',
    'CRON_SECRET',

    // ─── Google APIs ───────────────────────────────────────────────────────────
    'GOOGLE_PAGESPEED_API_KEY',
    'GOOGLE_PLACES_API_KEY',
    'GOOGLE_AI_API_KEY',
    'GCP_PROJECT_ID',

    // ─── External Services ─────────────────────────────────────────────────────
    'SERP_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'FROM_EMAIL',

    // ─── Admin ─────────────────────────────────────────────────────────────────
    'ADMIN_SECRET',
] as const;

const OPTIONAL_ENV_VARS = [
    // GCS / Cloud Storage
    'GCS_BUCKET_NAME',
    'GCP_REGION',

    // LangSmith tracing
    'LANGSMITH_API_KEY',
    'LANGSMITH_WORKSPACE_ID',
    'LANGCHAIN_API_KEY',
    'LANGCHAIN_PROJECT',

    // Google OAuth
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',

    // Puppeteer / Chrome path in Docker/Cloud Run
    'CHROME_EXECUTABLE_PATH',

    // Alerting
    'ALERT_WEBHOOK_URL',

    // Admin API keys
    'ADMIN_API_KEY',
    'MASTER_API_KEY',

    // Tenant defaults
    'DEFAULT_TENANT_ID',

    // LLM model selection (Gemini)
    'GEMINI_31_PRO_ENABLED',
    'GEMINI_31_PRO_TRAFFIC_PCT',
    'LLM_MODEL_DIAGNOSIS',
    'LLM_MODEL_FLASH',
    'LLM_MODEL_PROPOSAL',
    'THINKING_MODE_ENABLED',
    'THINKING_BUDGET_DIAGNOSIS',
    'THINKING_BUDGET_PROPOSAL',
    'MULTIMODAL_ENABLED',
    'STREAMING_ENABLED',
    'SINGLE_PASS_DIAGNOSIS',

    // Stripe price IDs
    'STRIPE_PRICE_ID_STARTER',
    'STRIPE_PRICE_ID_PRO',
    'STRIPE_PRICE_ID_AGENCY',

    // Redis (optional caching layer)
    'REDIS_URL',

    // Webhook notifications
    'WEBHOOK_URL',
] as const;

export function validateEnv(): void {
    const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]?.trim());
    const missingOptional = OPTIONAL_ENV_VARS.filter(v => !process.env[v]?.trim());

    if (missingOptional.length > 0) {
        console.warn(
            `[validateEnv] ⚠️  Optional env vars not set (non-fatal):\n` +
            missingOptional.map(v => `  - ${v}`).join('\n')
        );
    }

    if (missing.length > 0) {
        throw new Error(
            `[validateEnv] FATAL: Missing required environment variables:\n` +
            missing.map(v => `  - ${v}`).join('\n') +
            `\n\nSet these in .env.local or Cloud Run environment config before starting the server.`
        );
    }

    console.log('[validateEnv] ✅ All required environment variables present');
}
