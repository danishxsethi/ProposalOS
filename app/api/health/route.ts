import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import packageJson from '../../../package.json';

const version = packageJson.version;

/**
 * Advanced Health Check (Fix 4E)
 * 
 * Endpoint for Cloud Run liveness/readiness probes and UptimeRobot monitoring.
 * Returns 200 when the critical DB path is healthy, 503 on hard failure.
 * Each subsystem reports independently so alerts are granular.
 */
export async function GET() {
    const checks: Record<string, string> = {};
    let dbOk = false;

    // 1. Database (hard dependency — 503 if fails)
    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = 'ok';
        dbOk = true;
    } catch (err) {
        checks.database = `error: ${String(err).slice(0, 200)}`;
    }

    // 2. Stripe key configured (soft dependency)
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    checks.stripe = stripeKey && !stripeKey.startsWith('sk_test_placeholder')
        ? 'configured'
        : 'missing_or_placeholder';

    // 3. LLM API key (soft dependency — audits fail without this)
    const llmKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    checks.llm = llmKey ? 'configured' : 'missing';

    // 4. Resend email configured (soft dependency)
    checks.email = process.env.RESEND_API_KEY ? 'configured' : 'missing';

    // 5. NeverBounce (optional soft dependency)
    checks.neverbounce = process.env.NEVERBOUNCE_API_KEY ? 'configured' : 'not_configured';

    const status = dbOk ? 'ok' : 'degraded';
    const httpStatus = dbOk ? 200 : 503;

    return NextResponse.json(
        {
            status,
            version,
            timestamp: new Date().toISOString(),
            checks,
        },
        { status: httpStatus }
    );
}
