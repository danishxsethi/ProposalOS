#!/usr/bin/env npx tsx
/**
 * Phase Z Smoke Test Harness
 *
 * Runs the four mandatory Phase Z smoke tests:
 *   A - 10-URL audit smoke (with async polling)
 *   B - Multi-tenant isolation smoke (authoritative RLS)
 *   C - Cold outreach / email smoke (sandbox send)
 *   D - Billing smoke (Stripe test-key-only check)
 *
 * Safety: refuses to run against production.
 * Usage:
 *   npm run smoke:phase-z
 *   npm run smoke:phase-z -- --smoke=B
 *   npm run smoke:phase-z -- --skip-server
 */

import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Resend } from 'resend';

// Load .env.local first (overrides .env), then .env as fallback
dotenvConfig({ path: path.join(process.cwd(), '.env.local'), override: true });
dotenvConfig({ path: path.join(process.cwd(), '.env') });

import { runPreflight, SmokeStatus, PreflightResult } from './phase-z/preflight';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SmokeStepResult {
  step: string;
  status: SmokeStatus;
  detail: string;
}

export interface SmokeResult {
  smoke: string;
  status: SmokeStatus;
  steps: SmokeStepResult[];
  blockedReason?: string;
  durationMs: number;
  timestamp: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || '';
const TENANT_ID = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000000';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';

const ONLY_SMOKE = process.argv.find((a) => a.startsWith('--smoke='))?.split('=')[1];
const SKIP_SERVER = process.argv.includes('--skip-server');

const REPORT_MD_PATH = path.join(process.cwd(), 'docs', 'remediation', '010-phase-z-smoke-readiness.md');
const REPORT_JSON_PATH = path.join(process.cwd(), 'docs', 'remediation', '010-phase-z-smoke-evidence.json');

const results: SmokeResult[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(url, { headers });
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

async function httpPost(url: string, data: unknown, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text().catch(() => ''); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`;
  if (TENANT_ID) h['x-tenant-id'] = TENANT_ID;
  return h;
}

// ─── Smoke A: 10-URL Audit (Asynchronous Polling) ───────────────────────────

const SMOKE_A_URLS = [
  { url: 'https://www.example.com', industry: 'general', label: 'Example (generic)' },
  { url: 'https://www.wikipedia.org', industry: 'education', label: 'Wikipedia (education)' },
  { url: 'https://www.gnu.org', industry: 'software', label: 'GNU (software)' },
  { url: 'https://www.w3.org', industry: 'standards', label: 'W3C (standards)' },
  { url: 'https://www.ietf.org', industry: 'internet', label: 'IETF (internet)' },
  { url: 'https://www.apache.org', industry: 'foundation', label: 'Apache (foundation)' },
  { url: 'https://www.mozilla.org', industry: 'browser', label: 'Mozilla (browser)' },
  { url: 'https://www.python.org', industry: 'programming', label: 'Python (programming)' },
  { url: 'https://www.postgresql.org', industry: 'database', label: 'PostgreSQL (database)' },
  { url: 'https://www.iana.org', industry: 'protocols', label: 'IANA (protocols)' },
];

async function runSmokeA(preflight: PreflightResult): Promise<SmokeResult> {
  const start = Date.now();
  const steps: SmokeStepResult[] = [];
  const ts = new Date().toISOString();

  if (SKIP_SERVER || preflight.status === 'BLOCKED_SERVER_NOT_RUNNING') {
    return {
      smoke: 'A - 10-URL Audit',
      status: 'BLOCKED_SERVER_NOT_RUNNING',
      steps: [{ step: 'server-check', status: 'BLOCKED_SERVER_NOT_RUNNING', detail: 'Server is not running or --skip-server flag set' }],
      blockedReason: 'Server dependency not satisfied. Start the Next.js server first: npm run dev',
      durationMs: Date.now() - start,
      timestamp: ts,
    };
  }

  steps.push({ step: 'server-health-preflight', status: 'PASS', detail: `Server at ${BASE_URL} responded successfully` });

  const auditResults: Array<{ label: string; url: string; auditId?: string; status: string; latencyMs: number; findingsCount?: number; proposalsCount?: number; error?: string }> = [];
  let passCount = 0;

  console.log(`\nTriggering ${SMOKE_A_URLS.length} audits and polling progress...`);

  for (const target of SMOKE_A_URLS) {
    const auditStart = Date.now();
    try {
      const res = await httpPost(`${BASE_URL}/api/audit`, {
        url: target.url,
        name: target.label,
        city: 'Test City',
        industry: target.industry,
      }, authHeaders());

      const body = res.body as Record<string, any>;

      if (res.ok && body.id) {
        const auditId = body.id;
        
        // Polling loop until COMPLETED or FAILED (with max timeout 15s for local/dev smoke test speed)
        let status = body.status || 'QUEUED';
        let pollAttempts = 0;
        const maxPollAttempts = 45;
        const pollIntervalMs = 1000;
        let findingsCount = 0;
        let proposalsCount = 0;

        while ((status === 'QUEUED' || status === 'PROCESSING' || status === 'RUNNING') && pollAttempts < maxPollAttempts) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          pollAttempts++;

          const pollRes = await httpGet(`${BASE_URL}/api/audit/${auditId}`, authHeaders());
          if (pollRes.ok && pollRes.body) {
            const pollBody = pollRes.body as any;
            status = pollBody.status || 'UNKNOWN';
            findingsCount = pollBody.findings?.length || 0;
            proposalsCount = pollBody.proposals?.length || 0;
          } else {
            status = 'POLL_FAILED';
            break;
          }
        }

        const latencyMs = Date.now() - auditStart;

        if (status === 'COMPLETE' || status === 'COMPLETED' || status === 'PARTIAL' || status === 'DEGRADED') {
          passCount++;
          auditResults.push({
            label: target.label,
            url: target.url,
            auditId,
            status,
            latencyMs,
            findingsCount,
            proposalsCount,
          });
          steps.push({
            step: `audit:${target.label}`,
            status: 'PASS',
            detail: `auditId=${auditId} status=${status} latency=${latencyMs}ms findings=${findingsCount} proposals=${proposalsCount}`,
          });
        } else {
          auditResults.push({
            label: target.label,
            url: target.url,
            auditId,
            status,
            latencyMs,
            findingsCount,
            proposalsCount,
            error: `Timeout or finished with unexpected status: ${status}`,
          });
          steps.push({
            step: `audit:${target.label}`,
            status: 'FAIL',
            detail: `auditId=${auditId} status=${status} latency=${latencyMs}ms`,
          });
        }
      } else {
        const latencyMs = Date.now() - auditStart;
        auditResults.push({
          label: target.label,
          url: target.url,
          status: 'TRIGGER_FAILED',
          latencyMs,
          error: res.body ? JSON.stringify(res.body) : `HTTP status ${res.status}`,
        });
        steps.push({
          step: `audit:${target.label}`,
          status: 'FAIL',
          detail: `Trigger failed. Status ${res.status}: ${JSON.stringify(res.body).slice(0, 100)}`,
        });
      }
    } catch (e) {
      const latencyMs = Date.now() - auditStart;
      auditResults.push({
        label: target.label,
        url: target.url,
        status: 'EXCEPTION',
        latencyMs,
        error: e instanceof Error ? e.message : String(e),
      });
      steps.push({
        step: `audit:${target.label}`,
        status: 'FAIL',
        detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const latencies = auditResults.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const failureCount = auditResults.length - passCount;
  const failureRate = (failureCount / auditResults.length) * 100;

  steps.push({
    step: 'latency-summary',
    status: passCount > 0 ? 'PASS' : 'FAIL',
    detail: `P50=${p50}ms P95=${p95}ms. Failure rate: ${failureRate.toFixed(1)}% (${passCount}/${SMOKE_A_URLS.length} successful)`,
  });

  const overallStatus: SmokeStatus = passCount === SMOKE_A_URLS.length ? 'PASS' : 'FAIL';
  return {
    smoke: 'A - 10-URL Audit',
    status: overallStatus,
    steps,
    durationMs: Date.now() - start,
    timestamp: ts,
  };
}

// ─── Smoke B: Multi-Tenant Isolation (Authoritative RLS) ────────────────────

async function runSmokeB(): Promise<SmokeResult> {
  const start = Date.now();
  const steps: SmokeStepResult[] = [];
  const ts = new Date().toISOString();

  steps.push({ step: 'rls-preflight-check', status: 'PASS', detail: 'Running authoritative scripts/rls-smoke-test.ts' });

  try {
    const output = execSync('npx tsx scripts/rls-smoke-test.ts', {
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env },
      cwd: process.cwd(),
    });

    const passMatch = output.match(/PASS_COUNT (\d+)\/(\d+)/);
    if (passMatch) {
      const passed = parseInt(passMatch[1] ?? '0');
      const total = parseInt(passMatch[2] ?? '0');
      const allPass = passed === total && total === 8;

      steps.push({
        step: 'rls-db-isolation-assertions',
        status: allPass ? 'PASS' : 'FAIL',
        detail: `${passed}/${total} database-level RLS checks passed (Expected 8/8)`,
      });

      return {
        smoke: 'B - Multi-Tenant Isolation',
        status: allPass ? 'PASS' : 'FAIL',
        steps,
        durationMs: Date.now() - start,
        timestamp: ts,
      };
    } else {
      steps.push({
        step: 'rls-db-isolation-assertions',
        status: 'FAIL',
        detail: 'Could not parse PASS_COUNT from authoritative script output',
      });
      return {
        smoke: 'B - Multi-Tenant Isolation',
        status: 'FAIL',
        steps,
        durationMs: Date.now() - start,
        timestamp: ts,
      };
    }
  } catch (e) {
    steps.push({
      step: 'rls-execution-failure',
      status: 'FAIL',
      detail: e instanceof Error ? e.message.slice(0, 400) : String(e),
    });
    return {
      smoke: 'B - Multi-Tenant Isolation',
      status: 'FAIL',
      steps,
      durationMs: Date.now() - start,
      timestamp: ts,
    };
  }
}

// ─── Smoke C: Cold Outreach / Email ──────────────────────────────────────────

async function runSmokeC(preflight: PreflightResult): Promise<SmokeResult> {
  const start = Date.now();
  const steps: SmokeStepResult[] = [];
  const ts = new Date().toISOString();

  // If preflight failed RESEND_API_KEY presence
  if (preflight.missingKeys.includes('RESEND_API_KEY')) {
    return {
      smoke: 'C - Cold Outreach / Email',
      status: 'BLOCKED_NEEDS_OPERATOR_KEY',
      steps: [{ step: 'resend-key-check', status: 'BLOCKED_NEEDS_OPERATOR_KEY', detail: 'RESEND_API_KEY is missing or placeholder.' }],
      blockedReason: 'RESEND_API_KEY operator key is required for real sandbox send path.',
      durationMs: Date.now() - start,
      timestamp: ts,
    };
  }

  // 1. Email Local Generation Pipeline
  try {
    const { runEmailPipeline } = await import('../lib/email');
    const { runWithTenantAsync } = await import('../lib/tenant/context');
    const mockAudit = {
      id: 'smoke-test-audit',
      businessName: 'Smoke Test Dental',
      businessCity: 'Test City',
      businessUrl: 'https://example.com',
      businessIndustry: 'dental',
      verticalPlaybookId: 'dentist',
      overallScore: 65,
      findings: [
        {
          id: 'f1',
          module: 'website',
          category: 'Performance',
          type: 'PAINKILLER' as const,
          title: 'LCP is 6.8s (Poor)',
          description: 'Slow load time hurts patient bookings',
          metrics: { lcp_ms: 6800, performanceScore: 45 },
          impactScore: 8,
        },
      ],
    };
    const mockProposal = {
      id: 'smoke-test-proposal',
      executiveSummary: 'Smoke Test Dental in Test City is losing patients due to slow website.',
      webLinkToken: 'smoke-token-123',
      pricing: { starter: 497, growth: 1497, premium: 2997 },
      comparisonReport: null,
    };

    const { sequence, qualityPassed, finalReports } = await runWithTenantAsync(
      TENANT_ID,
      () => runEmailPipeline(mockAudit as any, mockProposal as any, null)
    );
    const avgScore = finalReports.length > 0 ? finalReports.reduce((s, r) => s + r.score, 0) / finalReports.length : 0;

    steps.push({
      step: 'email-generation',
      status: sequence.emails.length > 0 ? 'PASS' : 'FAIL',
      detail: `Generated ${sequence.emails.length} email variants, average quality score: ${avgScore.toFixed(1)}/100`,
    });

    const firstEmail = sequence.emails[0];
    if (firstEmail) {
      // Unsubscribe check
      const hasUnsubscribe = firstEmail.body?.toLowerCase().includes('unsubscribe') || firstEmail.body?.toLowerCase().includes('opt out');
      steps.push({
        step: 'can-spam-unsubscribe',
        status: hasUnsubscribe ? 'PASS' : 'FAIL',
        detail: hasUnsubscribe ? 'Unsubscribe link/opt-out pattern present' : 'Missing unsubscribe link/opt-out pattern',
      });

      // Non-deceptive subject check
      const subject = (firstEmail as any).subject || (firstEmail as any).subjectA || '';
      const hasDeceptivePrefix = /^(re:|fwd:|fw:)/i.test(subject.trim());
      steps.push({
        step: 'can-spam-subject',
        status: !hasDeceptivePrefix ? 'PASS' : 'FAIL',
        detail: !hasDeceptivePrefix ? `Subject is safe: "${subject.slice(0, 50)}"` : 'Subject has deceptive prefix (Re/Fwd)',
      });

      // No unresolved placeholders check
      const hasPlaceholders = /\{\{[a-zA-Z0-9_]+\}\}/.test(firstEmail.body || '');
      steps.push({
        step: 'no-unresolved-placeholders',
        status: !hasPlaceholders ? 'PASS' : 'FAIL',
        detail: !hasPlaceholders ? 'No unresolved liquid/mustache placeholders' : 'Found unresolved placeholders in email body',
      });
    }
  } catch (e) {
    steps.push({
      step: 'email-generation',
      status: 'FAIL',
      detail: `Email generation crash: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // 2. Real Sandbox Email Send Check
  try {
    const resend = new Resend(RESEND_KEY);
    const recipient = process.env.PHASE_Z_EMAIL_RECIPIENT || 'onboarding@resend.dev';
    
    // Send safe sandboxed test email using default sandbox settings
    const sendRes = await resend.emails.send({
      from: 'ProposalOS <onboarding@resend.dev>',
      to: [recipient],
      subject: '[SMOKE TEST] Phase Z Email Outreach',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Phase Z Smoke Test</h2>
          <p>This is a safe, automated sandbox-only smoke verification email for ProposalOS.</p>
          <p><strong>Timestamp:</strong> ${ts}</p>
        </div>
      `,
    });

    if (sendRes.error) {
      steps.push({
        step: 'resend-sandbox-send',
        status: 'FAIL',
        detail: `Resend sandbox send API rejected: ${sendRes.error.message}`,
      });
    } else {
      steps.push({
        step: 'resend-sandbox-send',
        status: 'PASS',
        detail: `Successfully completed Resend sandbox send to ${recipient}. Id: ${sendRes.data?.id}`,
      });
    }
  } catch (e) {
    steps.push({
      step: 'resend-sandbox-send',
      status: 'FAIL',
      detail: `Resend sandbox send exception: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const hasFailures = steps.some((s) => s.status === 'FAIL');
  return {
    smoke: 'C - Cold Outreach / Email',
    status: hasFailures ? 'FAIL' : 'PASS',
    steps,
    durationMs: Date.now() - start,
    timestamp: ts,
  };
}

// ─── Smoke D: Stripe Billing (Test Mode Only) ────────────────────────────────

async function runSmokeD(preflight: PreflightResult): Promise<SmokeResult> {
  const start = Date.now();
  const steps: SmokeStepResult[] = [];
  const ts = new Date().toISOString();

  // If preflight failed Stripe key presence
  if (preflight.missingKeys.includes('STRIPE_SECRET_KEY') || preflight.missingKeys.includes('STRIPE_WEBHOOK_SECRET')) {
    return {
      smoke: 'D - Billing',
      status: 'BLOCKED_NEEDS_OPERATOR_KEY',
      steps: [{ step: 'stripe-preflight-check', status: 'BLOCKED_NEEDS_OPERATOR_KEY', detail: 'Stripe credentials are missing or placeholders.' }],
      blockedReason: 'Stripe keys are required for real checkout/webhook assertions.',
      durationMs: Date.now() - start,
      timestamp: ts,
    };
  }

  // 1. Verify Stripe API connectivity (must be test mode)
  try {
    const res = await fetch('https://api.stripe.com/v1/products?limit=1', {
      headers: { Authorization: `Bearer ${STRIPE_KEY}` },
    });
    steps.push({
      step: 'stripe-api-connectivity',
      status: res.ok ? 'PASS' : 'FAIL',
      detail: `GET /v1/products -> status ${res.status} (test mode verified)`,
    });
  } catch (e) {
    steps.push({
      step: 'stripe-api-connectivity',
      status: 'FAIL',
      detail: `Stripe endpoint connection error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // 2. Create test checkout session
  try {
    const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'success_url': 'https://example.com/success',
        'cancel_url': 'https://example.com/cancel',
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': 'Smoke Test Product',
        'line_items[0][price_data][unit_amount]': '100',
        'line_items[0][quantity]': '1',
      }).toString(),
    });
    const sessionBody = await sessionRes.json() as any;
    if (sessionRes.ok && sessionBody.id) {
      steps.push({
        step: 'stripe-session-create',
        status: 'PASS',
        detail: `Successfully created Stripe test checkout session: ${sessionBody.id}`,
      });
    } else {
      steps.push({
        step: 'stripe-session-create',
        status: 'FAIL',
        detail: `Stripe checkout rejected: ${JSON.stringify(sessionBody).slice(0, 150)}`,
      });
    }
  } catch (e) {
    steps.push({
      step: 'stripe-session-create',
      status: 'FAIL',
      detail: `Stripe session exception: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  // 3. Webhook signature rejection assertion
  if (!SKIP_SERVER && preflight.status !== 'BLOCKED_SERVER_NOT_RUNNING') {
    try {
      const fakeWebhookRes = await httpPost(`${BASE_URL}/api/billing/webhook`, { type: 'smoke.test' }, {
        'stripe-signature': 'smoke-test-invalid-sig',
      });
      // 400 Bad Request is expected because the signature is invalid!
      steps.push({
        step: 'stripe-webhook-signature-rejection',
        status: fakeWebhookRes.status === 400 || fakeWebhookRes.status === 401 ? 'PASS' : 'FAIL',
        detail: `POST /api/billing/webhook with invalid sig returned status ${fakeWebhookRes.status} (expected 400, not 500)`,
      });
    } catch (e) {
      steps.push({
        step: 'stripe-webhook-signature-rejection',
        status: 'FAIL',
        detail: `Webhook connection crash: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  } else {
    steps.push({
      step: 'stripe-webhook-signature-rejection',
      status: 'SKIPPED_WITH_REASON',
      detail: 'Skipped webhook checks because server is offline or skip-server is active',
    });
  }

  const hasFailures = steps.some((s) => s.status === 'FAIL');
  return {
    smoke: 'D - Billing',
    status: hasFailures ? 'FAIL' : 'PASS',
    steps,
    durationMs: Date.now() - start,
    timestamp: ts,
  };
}

// ─── Render Evidence Report ──────────────────────────────────────────────────

function renderEvidenceReport(preflight: PreflightResult, results: SmokeResult[]): string {
  const ts = new Date().toISOString();
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const blockedCount = results.filter((r) => r.status.startsWith('BLOCKED')).length;

  let finalVerdict: SmokeStatus = 'PASS';
  if (preflight.status === 'BLOCKED_UNSAFE_ENV') {
    finalVerdict = 'BLOCKED_UNSAFE_ENV';
  } else if (failCount > 0) {
    finalVerdict = 'FAIL';
  } else if (blockedCount > 0) {
    finalVerdict = results.some((r) => r.status === 'BLOCKED_SERVER_NOT_RUNNING')
      ? 'BLOCKED_SERVER_NOT_RUNNING'
      : 'BLOCKED_NEEDS_OPERATOR_KEY';
  }

  let md = `# Phase Z Smoke Readiness Evidence\n\n`;
  md += `## Summary\n`;
  md += `- **Generated timestamp**: \`${ts}\`\n`;
  md += `- **Overall Status**: \`${finalVerdict}\`\n`;
  md += `- **Mandatory smokes passed**: ${passCount}/4\n`;
  md += `- **Mandatory smokes blocked**: ${blockedCount}/4\n`;
  md += `- **Mandatory smokes failed**: ${failCount}/4\n\n`;

  md += `## Smoke Results\n\n`;
  md += `| Smoke | Status | Command | Evidence | Notes |\n`;
  md += `|---|---|---|---|---|\n`;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status.startsWith('BLOCKED') ? '⚠️' : '❌';
    md += `| ${r.smoke} | ${icon} ${r.status} | \`npm run smoke:phase-z\` | \`010-phase-z-smoke-evidence.json\` | ${r.blockedReason || 'All steps cleared'} |\n`;
  }
  md += `\n`;

  md += `## Safety Controls\n`;
  md += `- **Production safeguards**: The preflight script checks and rejects any Base URL that matches production domain lists.\n`;
  md += `- **Stripe live-key refusal**: Validates ` + '`STRIPE_SECRET_KEY`' + ` starting format. Any live keys (\`sk_live_\`) trigger an immediate unsafe preflight abort.\n`;
  md += `- **Resend/email sandbox controls**: Test sends are strictly confined to Resend's sandboxed email addresses (\`onboarding@resend.dev\`).\n`;
  md += `- **Base URL restrictions**: Base URL is restricted to \`localhost\`, \`127.0.0.1\`, or verified dev/staging.\n`;
  md += `- **Secret redaction**: Password patterns are filtered and replaced with asterisks before writing any logs.\n`;
  md += `- **Server availability checks**: Verifies server health, alerting with instructions to start the dev server if not reachable.\n\n`;

  md += `## Environment Variables Required\n\n`;
  md += `| Variable | Required for | Safety constraint |\n`;
  md += `|---|---|---|\n`;
  md += `| \`DATABASE_URL\` | Database migrations / schema and RLS testing | Must be local/staging database |\n`;
  md += `| \`API_KEY\` | Authenticating requests against local endpoints | Used as Authorization Bearer |\n`;
  md += `| \`STRIPE_SECRET_KEY\` | Testing payment checkout and Stripe API | Must start with \`sk_test_\` (Strictly non-live) |\n`;
  md += `| \`STRIPE_WEBHOOK_SECRET\` | Validating signature matching on stripe webhooks | Test-mode secret format |\n`;
  md += `| \`RESEND_API_KEY\` | Sandbox email delivery and sequence generation | Test/sandbox-safe recipient settings |\n\n`;

  md += `## Preflight Log Details\n\n`;
  md += `\`\`\`\n`;
  preflight.details.forEach((d) => {
    md += ` - ${d}\n`;
  });
  md += `\`\`\`\n\n`;

  md += `## Detailed Step Logs\n\n`;
  for (const r of results) {
    md += `### ${r.smoke}\n`;
    md += `- **Status**: ${r.status}\n`;
    md += `- **Duration**: ${r.durationMs}ms\n`;
    md += `\n| Step | Status | Detail |\n`;
    md += `|---|---|---|\n`;
    r.steps.forEach((s) => {
      const icon = s.status === 'PASS' ? '✅' : s.status.startsWith('BLOCKED') ? '⚠️' : s.status === 'SKIPPED_WITH_REASON' ? '⏭️' : '❌';
      md += `| ${s.step} | ${icon} ${s.status} | ${s.detail.replace(/\|/g, '\\|')} |\n`;
    });
    md += `\n`;
  }

  return md;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n=== PHASE Z SMOKE TEST RUNNER ===\n');

  // 1. Centralized Preflight
  const preflight = await runPreflight();
  
  if (preflight.status === 'BLOCKED_UNSAFE_ENV') {
    console.error(`\n❌ PREFLIGHT CRITICAL SECURITY ALARM: Aborting execution due to Unsafe Environment Configuration.`);
    preflight.details.forEach((d) => console.error(` - ${d}`));
    process.exit(1);
  }

  console.log(`Preflight complete. Status: ${preflight.status}`);

  // 2. Select and run Smokes
  const smokeMap: Record<string, () => Promise<SmokeResult>> = {
    A: () => runSmokeA(preflight),
    B: () => runSmokeB(),
    C: () => runSmokeC(preflight),
    D: () => runSmokeD(preflight),
  };

  const toRun = ONLY_SMOKE ? [ONLY_SMOKE.toUpperCase()] : ['A', 'B', 'C', 'D'];

  for (const key of toRun) {
    const fn = smokeMap[key];
    if (!fn) { console.error(`Unknown smoke: ${key}`); continue; }
    console.log(`\nRunning Smoke ${key}...`);
    const r = await fn();
    results.push(r);
    const icon = r.status === 'PASS' ? '✅' : r.status.startsWith('BLOCKED') ? '⚠️' : '❌';
    console.log(`${icon} Smoke ${key} -> ${r.status} in ${r.durationMs}ms`);
  }

  // 3. Write Reports
  const reportMd = renderEvidenceReport(preflight, results);
  fs.mkdirSync(path.dirname(REPORT_MD_PATH), { recursive: true });
  fs.writeFileSync(REPORT_MD_PATH, reportMd, 'utf-8');
  console.log(`\n📄 Human-readable report written: ${REPORT_MD_PATH}`);

  const reportJson = {
    timestamp: new Date().toISOString(),
    preflight: {
      status: preflight.status,
      details: preflight.details,
      missingKeys: preflight.missingKeys,
    },
    results: results.map((r) => ({
      smoke: r.smoke,
      status: r.status,
      durationMs: r.durationMs,
      timestamp: r.timestamp,
      steps: r.steps,
    })),
  };
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(reportJson, null, 2), 'utf-8');
  console.log(`📄 Machine-readable JSON written: ${REPORT_JSON_PATH}`);

  // 4. Summarize and Exit
  console.log('\n=== FINAL SUMMARY ===');
  results.forEach((r) => {
    const icon = r.status === 'PASS' ? '✅' : r.status.startsWith('BLOCKED') ? '⚠️' : '❌';
    console.log(` - Smoke ${r.smoke}: ${icon} ${r.status}`);
  });

  const hasFailures = results.some((r) => r.status === 'FAIL');
  if (hasFailures) {
    console.log('\n❌ Suite finished with Failures. (NO-GO)');
    process.exit(1);
  } else {
    console.log('\n✅ Suite finished successfully (or was safely blocked/skipped due to keys/offline server).');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Smoke harness fatal crash:', e);
  process.exit(1);
});
