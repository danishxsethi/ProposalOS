import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';

// Load envs
dotenvConfig({ path: path.join(process.cwd(), '.env.local'), override: true });
dotenvConfig({ path: path.join(process.cwd(), '.env') });

export type SmokeStatus =
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'BLOCKED_NEEDS_OPERATOR_KEY'
  | 'BLOCKED_SERVER_NOT_RUNNING'
  | 'BLOCKED_UNSAFE_ENV'
  | 'SKIPPED_WITH_REASON';

export interface PreflightResult {
  status: SmokeStatus;
  details: string[];
  missingKeys: string[];
}

function isPlaceholder(val: string): boolean {
  return (
    !val ||
    val.includes('your-') ||
    val.includes('YOUR_') ||
    val.includes('xxxxx') ||
    val.includes('placeholder') ||
    val === ''
  );
}

export async function runPreflight(): Promise<PreflightResult> {
  const details: string[] = [];
  const missingKeys: string[] = [];
  let overallStatus: SmokeStatus = 'PASS';

  // 1. NODE_ENV Check
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    overallStatus = 'BLOCKED_UNSAFE_ENV';
    details.push('Unsafe Environment: NODE_ENV is set to production.');
  } else {
    details.push(`NODE_ENV is ${nodeEnv} (safe for testing)`);
  }

  // 2. BASE_URL Check
  const baseUrl =
    process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const prodPatterns = [/proposalengine\.com/i, /proposal-engine\.run\.app/i, /claraud\.com/i];
  if (prodPatterns.some((p) => p.test(baseUrl))) {
    overallStatus = 'BLOCKED_UNSAFE_ENV';
    details.push(`Unsafe Environment: BASE_URL points to a production domain: ${baseUrl}`);
  } else {
    details.push(`BASE_URL is ${baseUrl} (local/staging safe)`);
  }

  // 3. DATABASE_URL Check
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl || isPlaceholder(dbUrl)) {
    if (overallStatus === 'PASS' || overallStatus === 'BLOCKED_SERVER_NOT_RUNNING') {
      overallStatus = 'BLOCKED_NEEDS_OPERATOR_KEY';
    }
    missingKeys.push('DATABASE_URL');
    details.push('DATABASE_URL is missing or set to a placeholder.');
  } else if (dbUrl.includes('proposal-engine-db') && dbUrl.includes('cloudsql')) {
    overallStatus = 'BLOCKED_UNSAFE_ENV';
    details.push('Unsafe Environment: DATABASE_URL points to a production Cloud SQL database.');
  } else {
    // Redact password from connection string for logging
    const parsedDbUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
    details.push(`DATABASE_URL is set: ${parsedDbUrl} (local/staging database)`);
  }

  // 4. Test Key Checks (Stripe)
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey || isPlaceholder(stripeKey)) {
    if (overallStatus === 'PASS' || overallStatus === 'BLOCKED_SERVER_NOT_RUNNING') {
      overallStatus = 'BLOCKED_NEEDS_OPERATOR_KEY';
    }
    missingKeys.push('STRIPE_SECRET_KEY');
    details.push('STRIPE_SECRET_KEY is missing or set to a placeholder.');
  } else if (stripeKey.startsWith('sk_live_')) {
    overallStatus = 'BLOCKED_UNSAFE_ENV';
    details.push('Unsafe Environment: STRIPE_SECRET_KEY is a LIVE key! Refusing to run.');
  } else if (!stripeKey.startsWith('sk_test_')) {
    overallStatus = 'BLOCKED_UNSAFE_ENV';
    details.push(
      `Unsafe Environment: STRIPE_SECRET_KEY is not a test key: ${stripeKey.slice(0, 10)}...`
    );
  } else {
    details.push('STRIPE_SECRET_KEY starts with sk_test_ (safe test key)');
  }

  const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!stripeWebhook || isPlaceholder(stripeWebhook)) {
    if (overallStatus === 'PASS' || overallStatus === 'BLOCKED_SERVER_NOT_RUNNING') {
      overallStatus = 'BLOCKED_NEEDS_OPERATOR_KEY';
    }
    missingKeys.push('STRIPE_WEBHOOK_SECRET');
    details.push('STRIPE_WEBHOOK_SECRET is missing or set to a placeholder.');
  } else {
    details.push('STRIPE_WEBHOOK_SECRET is set');
  }

  // 5. Email Keys (Resend)
  const resendKey = process.env.RESEND_API_KEY || '';
  if (!resendKey || isPlaceholder(resendKey)) {
    if (overallStatus === 'PASS' || overallStatus === 'BLOCKED_SERVER_NOT_RUNNING') {
      overallStatus = 'BLOCKED_NEEDS_OPERATOR_KEY';
    }
    missingKeys.push('RESEND_API_KEY');
    details.push('RESEND_API_KEY is missing or set to a placeholder.');
  } else {
    details.push('RESEND_API_KEY is set (safe sandbox sending)');
  }

  // 6. Local Server Reachability (only if we are not explicitly skipping server checks)
  const skipServer = process.argv.includes('--skip-server');
  if (!skipServer) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(15000) });
      if (res.ok || res.status === 503) {
        details.push(
          `Local server at ${baseUrl}/api/health is reachable and responded with ${res.status} (expected degraded/sandbox health status is safe)`
        );
      } else {
        if (overallStatus === 'PASS') overallStatus = 'BLOCKED_SERVER_NOT_RUNNING';
        details.push(
          `Local server at ${baseUrl}/api/health responded with unexpected error status ${res.status}`
        );
      }
    } catch (e) {
      if (overallStatus === 'PASS') overallStatus = 'BLOCKED_SERVER_NOT_RUNNING';
      details.push(
        `Local server at ${baseUrl} is NOT reachable. Reason: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  } else {
    details.push('Skipping local server reachability check (--skip-server is active)');
  }

  return {
    status: overallStatus,
    details,
    missingKeys,
  };
}

// Running script directly
if (
  require.main === module ||
  (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('preflight.ts'))
) {
  runPreflight()
    .then((result) => {
      console.log('\n=== PHASE Z SMOKE PREFLIGHT ===');
      console.log(`Verdict: ${result.status}`);
      console.log('\nDetails:');
      result.details.forEach((d) => console.log(` - ${d}`));

      if (result.missingKeys.length > 0) {
        console.log('\nMissing Operator Variables (names only, no values):');
        result.missingKeys.forEach((k) => console.log(` - ${k}`));
      }

      process.exit(result.status === 'PASS' ? 0 : 1);
    })
    .catch((err) => {
      console.error('Preflight runner crashed:', err);
      process.exit(1);
    });
}
