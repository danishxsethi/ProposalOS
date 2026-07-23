const REQUIRED_ENV_VARS = [
    'DATABASE_URL',
    'API_KEY',
    'GOOGLE_PAGESPEED_API_KEY',
    'GOOGLE_PLACES_API_KEY',
    'SERP_API_KEY',
    'GCP_PROJECT_ID',
    'GOOGLE_AI_API_KEY', // Used by competitorStrategy, actionPlan, keywordGap, reviewResponses, gbpDeep, consultingNarrative, contentQuality
] as const;

const OPTIONAL_ENV_VARS = [
    'LANGCHAIN_API_KEY',
    'LANGCHAIN_PROJECT',
    'RESEND_API_KEY',
    'WEBHOOK_URL',
    'REDIS_URL',
    'GCS_BUCKET_NAME',
    'GCP_REGION',
    'DEFAULT_TENANT_ID',
] as const;

export function validateEnv() {
    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required vars
    for (const envVar of REQUIRED_ENV_VARS) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }

    // Check optional but recommended vars
    for (const envVar of OPTIONAL_ENV_VARS) {
        if (!process.env[envVar]) {
            warnings.push(envVar);
        }
    }

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(v => console.error(`  - ${v}`));
        throw new Error(`Missing required env vars: ${missing.join(', ')}`);
    }

    if (warnings.length > 0) {
        console.warn('⚠️  Optional environment variables not set:');
        warnings.forEach(v => console.warn(`  - ${v}`));
    }

    console.log('✅ Environment validation passed');
}
