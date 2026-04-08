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

  // ─── URLs ──────────────────────────────────────────────────────────────────
  'NEXT_PUBLIC_APP_URL',
] as const;

const OPTIONAL_ENV_VARS = [
  // ─── GCS / Cloud Storage ───────────────────────────────────────────────────
  'GCS_BUCKET_NAME',
  'GCP_REGION',

  // ─── LangSmith tracing ─────────────────────────────────────────────────────
  'LANGSMITH_API_KEY',
  'LANGSMITH_WORKSPACE_ID',
  'LANGCHAIN_API_KEY',
  'LANGCHAIN_PROJECT',

  // ─── Google OAuth ──────────────────────────────────────────────────────────
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',

  // ─── Puppeteer / Chrome path in Docker/Cloud Run ───────────────────────────
  'CHROME_EXECUTABLE_PATH',

  // ─── Alerting ──────────────────────────────────────────────────────────────
  'ALERT_WEBHOOK_URL',

  // ─── Admin API keys ────────────────────────────────────────────────────────
  'ADMIN_API_KEY',
  'MASTER_API_KEY',

  // ─── Tenant defaults ───────────────────────────────────────────────────────
  'DEFAULT_TENANT_ID',

  // ─── LLM model selection (Gemini) ──────────────────────────────────────────
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

  // ─── Business Feature Flags ────────────────────────────────────────────────
  'ENABLE_BATCH_MODE',
  'ENABLE_WHITE_LABEL',
  'ENABLE_COLD_OUTREACH',
  'ENABLE_WIDGET_EMBED',
  'ENABLE_B2C_MODE',

  // ─── Stripe price IDs ──────────────────────────────────────────────────────
  'STRIPE_PRICE_ID_STARTER',
  'STRIPE_PRICE_ID_PRO',
  'STRIPE_PRICE_ID_AGENCY',
  'STRIPE_PRICE_ID_PROPOSAL_ESSENTIALS',
  'STRIPE_PRICE_ID_PROPOSAL_GROWTH',
  'STRIPE_PRICE_ID_PROPOSAL_PREMIUM',

  // ─── Redis (optional caching layer) ────────────────────────────────────────
  'REDIS_URL',

  // ─── Webhook notifications ─────────────────────────────────────────────────
  'WEBHOOK_URL',
  'WEBHOOK_SECRET',

  // ─── Email / Outreach ──────────────────────────────────────────────────────
  'RESEND_FROM_EMAIL',
  'OPERATOR_EMAIL',
  'OUTREACH_SENDING_EMAILS',
  'OUTREACH_SENDING_DOMAINS',
  'OUTREACH_SENDER_NAME',
  'OUTREACH_DOMAIN_DAILY_LIMIT',
  'OUTREACH_CALENDAR_URL',

  // ─── Branding ──────────────────────────────────────────────────────────────
  'BRAND_NAME',
  'BRAND_LOGO_URL',
  'BRAND_PRIMARY_COLOR',
  'BRAND_ACCENT_COLOR',
  'BRAND_CONTACT_EMAIL',
  'BRAND_CONTACT_PHONE',
  'BRAND_WEBSITE',
  'BRAND_PHYSICAL_ADDRESS',
  'BRAND_TAGLINE',
  'BRAND_FOOTER_TEXT',

  // ─── Client-side Branding ──────────────────────────────────────────────────
  'NEXT_PUBLIC_BRAND_NAME',
  'NEXT_PUBLIC_BRAND_LOGO_URL',
  'NEXT_PUBLIC_BRAND_PRIMARY_COLOR',
  'NEXT_PUBLIC_BRAND_ACCENT_COLOR',
  'NEXT_PUBLIC_BRAND_CONTACT_EMAIL',
  'NEXT_PUBLIC_BRAND_CONTACT_PHONE',
  'NEXT_PUBLIC_BRAND_WEBSITE',
  'NEXT_PUBLIC_BRAND_TAGLINE',
  'NEXT_PUBLIC_BRAND_FOOTER_TEXT',

  // ─── Analytics ─────────────────────────────────────────────────────────────
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',

  // ─── External API Enrichment ───────────────────────────────────────────────
  'APOLLO_API_KEY',
  'HUNTER_API_KEY',
  'PROXYCURL_API_KEY',
  'CLEARBIT_API_KEY',
  'ZEROBOUNCE_API_KEY',
  'NEVERBOUNCE_API_KEY',

  // ─── Search Engines ────────────────────────────────────────────────────────
  'GOOGLE_SEARCH_API_KEY',
  'GOOGLE_SEARCH_CX',

  // ─── LLM Reliability & Performance ─────────────────────────────────────────
  'LLM_MAX_RETRIES',
  'LLM_BASE_RETRY_DELAY_MS',
  'LLM_MAX_RETRY_DELAY_MS',
  'LLM_DEFAULT_TIMEOUT_MS',
  'LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD',
  'LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD',
  'LLM_CIRCUIT_BREAKER_TIMEOUT_MS',
  'LLM_CACHE_ENABLED',
  'LLM_CACHE_MAX_SIZE',
  'LLM_CACHE_TTL_MS',
  'LLM_AUDIT_LOG_ENABLED',
  'LLM_AUDIT_LOG_LEVEL',
  'LLM_AUDIT_REDACT_INPUT',
  'LLM_AUDIT_REDACT_OUTPUT',

  // ─── Cost / Budget ─────────────────────────────────────────────────────────
  'AUDIT_COST_THRESHOLD_CENTS',

  // ─── Runtime ───────────────────────────────────────────────────────────────
  'SKIP_ENV_VALIDATION',
  'LOG_LEVEL',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]?.trim());
  const missingOptional = OPTIONAL_ENV_VARS.filter((v) => !process.env[v]?.trim());

  if (missingOptional.length > 0) {
    console.warn(
      `[validateEnv] ⚠️  Optional env vars not set (non-fatal):\n` +
        missingOptional.map((v) => `  - ${v}`).join('\n')
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `[validateEnv] FATAL: Missing required environment variables:\n` +
        missing.map((v) => `  - ${v}`).join('\n') +
        `\n\nSet these in .env.local or Cloud Run environment config before starting the server.`
    );
  }

  console.log('[validateEnv] ✅ All required environment variables present');
}
