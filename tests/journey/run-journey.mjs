#!/usr/bin/env node
/**
 * tests/journey/run-journey.mjs
 *
 * Controlled joined-journey orchestrator (M1).
 *
 * ONE coherent run through the real product, over real HTTP:
 *   1. Disposable, migrated PostgreSQL database (with the RLS-enforced app_user
 *      role the production connection uses).
 *   2. Tenant + scoped pe_live API key seeded for the run (never reused).
 *   3. Local fixture website on loopback (deliberate detectable issues + positive
 *      controls) — reachable through the real SSRF-validated collectors via the
 *      test-scoped loopback allowlist.
 *   4. Local fixture servers for external providers (SerpApi/Yelp/BBB/YellowPages/
 *      Google) and S3-compatible object storage — the Next server's test-scoped
 *      interception redirects ONLY the allowlisted provider hosts; no request
 *      leaves the VM.
 *   5. Real Next.js server (next dev, 127.0.0.1) with the deterministic fixture
 *      LLM provider (explicitly labeled; NO real Bedrock inference happens in
 *      this run).
 *   6. Journey: authenticated POST /api/audit → durable AuditJob enqueue → real
 *      push dispatch (WORKER_DISPATCH_URL self-call) → worker claims the job →
 *      runAudit (real collectors: safeFetch crawl, local Lighthouse, axe-core,
 *      screenshots) → diagnosis graph → proposal graph → proposal QA → persisted
 *      proposal → authenticated review → public secure view → PDF.
 *
 * Everything is torn down afterwards; the disposable DB is dropped.
 *
 * Usage:
 *   node tests/journey/run-journey.mjs
 *
 * Configuration (all optional, defaults are local/disposable):
 *   JOURNEY_DB_ADMIN_URL   — admin Postgres URL   (default local disposable container)
 *   JOURNEY_NEXT_PORT      — port for the Next server (default 3117)
 *   JOURNEY_EVIDENCE_DIR   — where artifacts are written (default tests/journey/evidence)
 */
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const crypto = webcrypto;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const EVIDENCE_DIR = process.env.JOURNEY_EVIDENCE_DIR || path.join(__dirname, 'evidence');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ─── Configuration ────────────────────────────────────────────────────────────

const DB_ADMIN_URL = process.env.JOURNEY_DB_ADMIN_URL || 'postgresql://postgres:glmrc6pw@127.0.0.1:5445/postgres';
const APP_USER = 'app_user';
// NOTE: the repository's test helpers (tests/helpers/realDb.ts) normalize the
// cluster-wide app_user role password to 'app_user'; the journey aligns with
// that convention so either initialization order works.
const APP_PASSWORD = 'app_user';
const NEXT_PORT = Number(process.env.JOURNEY_NEXT_PORT || 3117);
const NEXT_URL = `http://127.0.0.1:${NEXT_PORT}`;

const BUSINESS = {
  name: 'Summit Ridge Heating & Air',
  city: 'Denver',
  industry: 'hvac',
  url: null, // filled after the fixture site binds
};

const PROVIDER_FIXTURE_HOSTS = [
  'serpapi.com',
  'www.yelp.com',
  'yelp.com',
  'www.bbb.org',
  'bbb.org',
  'www.yellowpages.com',
  'yellowpages.com',
  'www.google.com',
  'google.com',
].join(',');

// ─── Logging / evidence ───────────────────────────────────────────────────────

const runLog = [];
function log(step, detail, extra = {}) {
  const entry = { at: new Date().toISOString(), step, detail, ...extra };
  runLog.push(entry);
  console.log(`[${entry.at}] [${step}] ${detail}`);
}

const timers = {};
function timeStart(label) {
  timers[label] = Date.now();
}
function timeEnd(label) {
  const ms = Date.now() - (timers[label] ?? Date.now());
  log('timing', `${label} took ${ms}ms`, { label, ms });
  return ms;
}

// ─── Phase 1: disposable database ────────────────────────────────────────────

async function setupDatabase() {
  const dbName = `proposalos_journey_${randomBytes(5).toString('hex')}`;
  const admin = new pg.Client({ connectionString: DB_ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const dbUrl = `postgresql://${APP_USER}:${APP_PASSWORD}@127.0.0.1:5445/${dbName}`;
  const adminDbUrl = `postgresql://postgres:glmrc6pw@127.0.0.1:5445/${dbName}`;

  // Migrate
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: adminDbUrl, DIRECT_URL: adminDbUrl },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  // Normalize the cluster-wide app role (same convention as tests/helpers/realDb.ts)
  const roleAdmin = new pg.Client({ connectionString: DB_ADMIN_URL });
  await roleAdmin.connect();
  await roleAdmin.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
         CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';
       ELSE
         ALTER ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD}';
       END IF;
     END $$`
  );
  await roleAdmin.end();

  // Grant the RLS-enforced app role everything it needs (same shape the CI
  // bootstrap script grants), so the server connects exactly like production.
  const granter = new pg.Client({ connectionString: adminDbUrl });
  await granter.connect();
  await granter.query(`GRANT CONNECT ON DATABASE "${dbName}" TO ${APP_USER}`);
  await granter.query(`GRANT USAGE ON SCHEMA public TO ${APP_USER}`);
  await granter.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER}`);
  await granter.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER}`);
  await granter.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user');
  await granter.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user');

  // Seed tenant + API key (superuser seeding; the server runs as app_user under RLS)
  const apiKey = `pe_live_${randomBytes(24).toString('hex')}`;
  const keyHash = createHash('sha256').update(apiKey).digest('hex');
  const tenantId = crypto.randomUUID();
  await granter.query(
    `INSERT INTO "Tenant" (id, name, "planTier", status, "subscriptionStatus", branding, settings, "isActive", "requireHumanReview", "createdAt", "updatedAt")
     VALUES ($1, $2, 'starter', 'trial', 'inactive', '{}', '{}', true, false, now(), now())`,
    [tenantId, 'GLM Journey Operator Tenant']
  );
  await granter.query(
    `INSERT INTO "ApiKey" (id, "tenantId", "keyHash", "keyPrefix", name, scopes, "isActive", "rateLimitPerDay", "usageCount", "lastResetAt", "createdAt")
     VALUES ($5, $1, $2, $3, 'journey-operator', $4, true, 1000, 0, now(), now())`,
    [tenantId, keyHash, apiKey.slice(0, 12), ['*'], crypto.randomUUID()]
  );
  await granter.end();

  log('db', `disposable database ${dbName} created, migrated, granted, seeded`, { dbName, tenantId });
  return { dbName, dbUrl, adminDbUrl, apiKey, tenantId };
}

async function dropDatabase(dbName) {
  const admin = new pg.Client({ connectionString: DB_ADMIN_URL });
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName]
  );
  await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.end();
}

// ─── Phase 2: fixture servers ────────────────────────────────────────────────

async function startFixtures() {
  const { startFixtureSite, BUSINESS: fixtureBusiness } = await import('./fixture-site.mjs');
  const { startFixtureProviders } = await import('./fixture-providers.mjs');
  const { startFixtureS3 } = await import('./fixture-s3.mjs');

  const site = await startFixtureSite(0);
  const providers = await startFixtureProviders({
    businessName: fixtureBusiness.name,
    city: fixtureBusiness.city,
    fixtureSiteUrl: site.url,
    competitorSiteUrl: `${site.url}/competitor-site`,
  });
  const s3 = await startFixtureS3(0);

  BUSINESS.url = site.url;
  log('fixtures', `fixture site ${site.url}, providers ${providers.url}, s3 ${s3.url}`);
  return { site, providers, s3 };
}

// ─── Phase 3: Next.js server ─────────────────────────────────────────────────

function buildServerEnv(db, fixtures, chromePath) {
  const workerSecret = `wsec_${randomBytes(24).toString('hex')}`;
  const preloadPath = path.join(__dirname, 'fixture-fetch-preload.cjs');
  return {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    // The provider fixture interception must be active in EVERY process
    // (Next dev spawns a separate next-server worker); --require preload is
    // inherited by children, unlike single-process instrumentation hooks.
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : ''}--require ${preloadPath}`,

    // Database — the server connects as the RLS-enforced app role.
    DATABASE_URL: db.dbUrl,
    DIRECT_URL: db.dbUrl,

    // Auth (test values; this server is loopback-only and short-lived)
    NEXTAUTH_SECRET: `ns_${randomBytes(24).toString('hex')}`,
    NEXTAUTH_URL: NEXT_URL,
    NEXT_PUBLIC_APP_URL: NEXT_URL,
    BASE_URL: NEXT_URL,
    API_KEY: `env_${randomBytes(16).toString('hex')}`,
    DEFAULT_TENANT_ID: db.tenantId,
    ADMIN_SECRET: `as_${randomBytes(16).toString('hex')}`,
    CRON_SECRET: `cs_${randomBytes(16).toString('hex')}`,
    OPERATOR_EMAIL: 'journey-operator@fixture.test',
    FROM_EMAIL: 'notifications@fixture.test',

    // Email: intentionally UNSET (RESEND_API_KEY absent → sendEmail no-ops).
    // Outbound customer communication is disabled for the journey.

    // Stripe: inert placeholders (no billing flows are exercised).
    STRIPE_SECRET_KEY: 'sk_test_journey_placeholder',
    STRIPE_WEBHOOK_SECRET: 'whsec_journey_placeholder',

    // External providers → local fixtures (test-scoped interception)
    SERP_API_KEY: 'fixture-serp-key',
    PROPOSALOS_PROVIDER_FIXTURE_URL: fixtures.providers.url,
    PROPOSALOS_PROVIDER_FIXTURE_HOSTS: PROVIDER_FIXTURE_HOSTS,

    // Storage → local S3-compatible fixture
    PROPOSALOS_DATA_BUCKET: 'journey-evidence-bucket',
    AWS_REGION: 'us-east-2',
    AWS_ENDPOINT_URL: fixtures.s3.url,
    AWS_ACCESS_KEY_ID: 'journey-fixture-key',
    AWS_SECRET_ACCESS_KEY: 'journey-fixture-secret',

    // LLM → deterministic fixture provider (labeled; no real inference)
    PROPOSALOS_FIXTURE_LLM_ENABLED: 'true',
    LLM_PRIMARY_PROVIDER: 'fixture',

    // SSRF: strictly-scoped loopback allowlist (hostname + IP-literal) for the
    // fixture site and the loopback-only fixture servers (S3 presigned URLs).
    PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS: 'localhost,127.0.0.1',

    // Worker: self-push dispatch so enqueue triggers the real HTTP push path
    WORKER_SECRET: workerSecret,
    WORKER_DISPATCH_URL: `${NEXT_URL}/api/worker/audit-job`,
    WORKER_POLL_BATCH_SIZE: '5',

    // Browser
    CHROME_EXECUTABLE_PATH: chromePath,

    // Business feature flags: keep the journey narrow
    ENABLE_COLD_OUTREACH: 'false',
    ENABLE_BATCH_MODE: 'true',
    ENABLE_WHITE_LABEL: 'false',
    ENABLE_WIDGET_EMBED: 'false',
    ENABLE_B2C_MODE: 'false',
    OUTREACH_SENDING_EMAILS: 'false',

    // Capacity: keep concurrent module browser work modest on the VM
    AUDIT_PHASE_CONCURRENCY: '4',

    // Env validation: required-var gate is skipped because RESEND_API_KEY is
    // deliberately unset (email disabled). All other required vars are provided.
    SKIP_ENV_VALIDATION: 'true',
  };
}

async function bootNextServer(env) {
  // Refuse to accidentally talk to a stale server from a previous run.
  try {
    const stale = await fetch(`${NEXT_URL}/api/health/live`).then((r) => r.ok);
    if (stale) {
      throw new Error(`Something is already listening on ${NEXT_URL} — stop it before running the journey.`);
    }
  } catch (error) {
    if (error instanceof TypeError || error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED') {
      // nothing listening — good
    } else {
      throw error;
    }
  }

  const child = spawn('npx', ['next', 'dev', '-p', String(NEXT_PORT), '-H', '127.0.0.1'], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group so teardown can kill the whole tree (npx -> next ->
    // next-server); killing only the npx wrapper orphans the server.
    detached: true,
  });

  const serverLogPath = path.join(EVIDENCE_DIR, `next-server-${RUN_ID}.log`);
  const serverLog = fs.createWriteStream(serverLogPath, { flags: 'a' });
  child.stdout.pipe(serverLog);
  child.stderr.pipe(serverLog);

  try {
    const started = Date.now();
    while (Date.now() - started < 240_000) {
      if (child.exitCode !== null) {
        throw new Error(`Next server exited early with code ${child.exitCode}; see ${serverLogPath}`);
      }
      try {
        // Liveness probe (process-only); the full /api/health reports degraded for
        // the intentionally-inert Stripe/Resend placeholders, which is expected.
        const response = await fetch(`${NEXT_URL}/api/health/live`);
        if (response.ok) {
          const body = await response.json();
          if (body.status === 'alive') {
            log('server', `Next server healthy at ${NEXT_URL} after ${Date.now() - started}ms`);
            return { child, serverLogPath };
          }
        }
      } catch {
        // not up yet
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error(`Next server did not become healthy within 240s; see ${serverLogPath}`);
  } catch (error) {
    // Never leak the child (or its next-server descendant): kill the whole
    // process group on any boot failure.
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    throw error;
  }
}

// ─── Phase 4: the joined journey ──────────────────────────────────────────────

async function waitFor(predicate, { timeoutMs, intervalMs = 5000, label }) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}${lastError ? ` (last error: ${lastError.message})` : ''}`);
}

async function runJourney(db, workerSecret) {
  const dbAdmin = new pg.Client({ connectionString: db.adminDbUrl });
  await dbAdmin.connect();
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${db.apiKey}`,
  };
  const journey = { steps: [] };
  const record = (step, ok, detail, data = {}) => {
    journey.steps.push({ step, ok, detail, at: new Date().toISOString(), ...data });
    log('journey', `${ok ? 'OK' : 'FAIL'} — ${step}: ${detail}`);
  };

  // Step 1: authenticated intake through the real route + middleware stack
  timeStart('intake');
  const intakeResponse = await fetch(`${NEXT_URL}/api/audit`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      url: BUSINESS.url,
      businessName: BUSINESS.name,
      businessCity: BUSINESS.city,
      industry: BUSINESS.industry,
    }),
  });
  const intakeText = await intakeResponse.text();
  let intakeBody;
  try {
    intakeBody = JSON.parse(intakeText);
  } catch {
    throw new Error(
      `Intake returned non-JSON (${intakeResponse.status}): ${intakeText.slice(0, 400)}`
    );
  }
  if (!intakeResponse.ok || !intakeBody.auditId) {
    throw new Error(`Intake failed (${intakeResponse.status}): ${JSON.stringify(intakeBody)}`);
  }
  const auditId = intakeBody.auditId;
  timeEnd('intake');
  record('intake', true, `audit ${auditId} created and queued (status ${intakeBody.status})`, {
    httpStatus: intakeResponse.status,
    auditId,
  });

  // Step 2: the durable job exists (verified through the DB, not the API)
  const admin = dbAdmin;
  const jobRow = await waitFor(
    async () => {
      const result = await admin.query(
        `SELECT id, status, attempts, "leaseOwner", "leaseToken" IS NOT NULL AS has_lease FROM audit_jobs WHERE "auditId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [auditId]
      );
      return result.rows[0] ?? null;
    },
    { timeoutMs: 30_000, intervalMs: 1000, label: 'AuditJob row for the new audit' }
  );
  record('enqueue', true, `durable AuditJob ${jobRow.id} present (status ${jobRow.status})`, {
    jobId: jobRow.id,
    attempts: jobRow.attempts,
  });

  // Step 3: worker processing (push dispatch fires from the enqueue path itself;
  // if it somehow does not, sweep the queue the way the cron fallback does).
  timeStart('audit-run');
  const statusTransitions = [];
  let lastTransitionKey = 'QUEUED';
  const auditFinal = await waitFor(
    async () => {
      const response = await fetch(`${NEXT_URL}/api/audit/${auditId}`, { headers: authHeaders });
      if (!response.ok) throw new Error(`audit status check failed: ${response.status}`);
      const audit = await response.json();
      const key = `${audit.status}/${audit.trustState ?? '-'}`;
      if (key !== lastTransitionKey) {
        statusTransitions.push({ at: new Date().toISOString(), status: audit.status, trustState: audit.trustState });
        log('journey', `audit transition → ${key}`);
        lastTransitionKey = key;
      }
      if (['COMPLETE', 'PARTIAL', 'DEGRADED', 'FAILED'].includes(audit.status)) return audit;
      return null;
    },
    { timeoutMs: 10 * 60_000, intervalMs: 3000, label: 'audit terminal status' }
  );
  timeEnd('audit-run');
  journey.steps.push({
    step: 'audit-transitions',
    ok: true,
    detail: 'audit status transitions observed during the run',
    transitions: statusTransitions,
    at: new Date().toISOString(),
  });

  const auditTerminalStatus = auditFinal.status;
  const trustState = auditFinal.trustState;
  record(
    'audit-run',
    auditTerminalStatus === 'COMPLETE' && trustState === 'TRUSTED',
    `audit finished: status=${auditTerminalStatus} trustState=${trustState} findings=${auditFinal.findings?.length ?? 0}`,
    {
      status: auditTerminalStatus,
      trustState,
      findingsCount: auditFinal.findings?.length ?? 0,
      modulesCompleted: auditFinal.modulesCompleted?.length ?? 0,
      modulesFailed: auditFinal.modulesFailed,
      moduleResults: auditFinal.moduleResults,
      apiCostCents: auditFinal.apiCostCents,
    }
  );

  if (auditTerminalStatus !== 'COMPLETE' || trustState !== 'TRUSTED') {
    // Trigger the poll-mode sweep once in case the push dispatch was lost, then
    // re-check before declaring failure (idempotent worker makes this safe).
    await fetch(`${NEXT_URL}/api/worker/audit-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerSecret}` },
      body: JSON.stringify({}),
    });
    throw new Error(
      `Audit did not reach COMPLETE/TRUSTED (status=${auditTerminalStatus}, trustState=${trustState}). See server log.`
    );
  }

  const evidenceRows = await admin.query(
    `SELECT module, "observationStatus", COUNT(*) AS snapshots FROM "EvidenceSnapshot" WHERE "auditId" = $1 GROUP BY module, "observationStatus" ORDER BY module`,
    [auditId]
  );
  record('evidence', true, `${evidenceRows.rows.length} module evidence groups persisted`, {
    evidence: evidenceRows.rows,
  });

  // Step 4: proposal generated by the worker (same transaction chain)
  timeStart('proposal');
  const proposal = await waitFor(
    async () => {
      const result = await admin.query(
        `SELECT p.id, p.status, p.version, p."webLinkToken", p."qaScore", p."qaResults", p."createdAt"
         FROM "Proposal" p WHERE p."auditId" = $1 ORDER BY p.version DESC LIMIT 1`,
        [auditId]
      );
      return result.rows[0] ?? null;
    },
    { timeoutMs: 5 * 60_000, intervalMs: 3000, label: 'proposal row' }
  );
  timeEnd('proposal');
  const proposalFull = await admin.query(`SELECT * FROM "Proposal" WHERE id = $1`, [proposal.id]);
  const proposalRow = proposalFull.rows[0];
  record('proposal', true, `proposal ${proposal.id} persisted (status ${proposal.status}, v${proposal.version})`, {
    proposalId: proposal.id,
    status: proposal.status,
    qaScore: proposalRow.qaScore,
    qaResultsPresent: Boolean(proposalRow.qaResults && Object.keys(proposalRow.qaResults).length > 0),
  });

  // Step 5: authenticated operator review surface
  const reviewResponse = await fetch(`${NEXT_URL}/api/proposals`, { headers: authHeaders });
  const reviewBody = await reviewResponse.json();
  const reviewList = Array.isArray(reviewBody) ? reviewBody : reviewBody.proposals ?? reviewBody.data ?? [];
  record(
    'review',
    reviewResponse.ok,
    `authenticated GET /api/proposals returned ${reviewResponse.status} with ${reviewList.length} proposal(s)`,
    { httpStatus: reviewResponse.status }
  );

  // Step 6: public secure view by web link token
  const token = proposalRow.webLinkToken;
  const counts = await admin.query(
    `SELECT
       (SELECT count(*) FROM "Finding" WHERE "auditId" = $1 AND excluded = false) AS findings_now,
       (SELECT count(*) FROM "Finding" WHERE "auditId" = $1) AS findings_all`,
    [auditId]
  );
  const provenance = (proposalRow.qaResults || {}).provenance || {};
  log('journey', `delivery counts: findings_now=${counts.rows[0].findings_now} findings_all=${counts.rows[0].findings_all} provenance.findingIds=${(provenance.findingIds || []).length}`);
  const viewResponse = await fetch(`${NEXT_URL}/api/proposal/token/${token}`);
  const viewText = await viewResponse.text();
  let viewBody = {};
  try { viewBody = JSON.parse(viewText); } catch { viewBody = { raw: viewText.slice(0, 200) }; }
  record(
    'secure-view',
    viewResponse.ok,
    `secure view GET /api/proposal/token/[token] returned ${viewResponse.status}${viewBody.error ? ` — ${viewBody.error}` : ''}`,
    { httpStatus: viewResponse.status, hasAudit: Boolean(viewBody.audit ?? viewBody.proposal), counts: counts.rows[0] }
  );

  // Step 7: public proposal page (the customer-facing render)
  const pageResponse = await fetch(`${NEXT_URL}/proposal/${token}`);
  const pageHtml = await pageResponse.text();
  record(
    'proposal-page',
    pageResponse.ok && pageHtml.length > 1000,
    `proposal page rendered (${pageResponse.status}, ${pageHtml.length} chars)`,
    { httpStatus: pageResponse.status }
  );
  fs.writeFileSync(path.join(EVIDENCE_DIR, `proposal-page-${RUN_ID}.html`), pageHtml);

  // Step 8: PDF deliverable
  timeStart('pdf');
  const pdfResponse = await fetch(`${NEXT_URL}/api/proposal/token/${token}/pdf`);
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  if (!pdfResponse.ok) {
    log('journey', `pdf error body: ${pdfBuffer.toString('utf8').slice(0, 200)}`);
  }
  timeEnd('pdf');
  const pdfPath = path.join(EVIDENCE_DIR, `proposal-${RUN_ID}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);
  record(
    'pdf',
    pdfResponse.ok && pdfBuffer.subarray(0, 4).toString('ascii') === '%PDF',
    `PDF generated (${pdfResponse.status}, ${pdfBuffer.length} bytes, magic ${(pdfBuffer.subarray(0, 4)).toString('ascii')})`,
    { httpStatus: pdfResponse.status, bytes: pdfBuffer.length, pdfPath }
  );

  // Step 9: worker job final state
  const jobFinal = await admin.query(
    `SELECT status, attempts, "errorMessage" FROM audit_jobs WHERE "auditId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
    [auditId]
  );
  record('worker-final', jobFinal.rows[0]?.status === 'SUCCEEDED', `AuditJob final: ${JSON.stringify(jobFinal.rows[0])}`, {
    job: jobFinal.rows[0],
  });

  await admin.end();
  return journey;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// ─── Chrome resolution ────────────────────────────────────────────────────────

function resolveChromePath() {
  const candidates = [
    process.env.JOURNEY_CHROME_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chrome',
    `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'No Chrome/Chromium binary found. Set JOURNEY_CHROME_PATH or CHROME_EXECUTABLE_PATH.'
  );
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const startedAt = Date.now();
  log('start', `controlled joined journey starting (run ${RUN_ID})`);

  const chromePath = resolveChromePath();
  log('preflight', `Chrome binary: ${chromePath}`);

  const db = await setupDatabase();
  const fixtures = await startFixtures();
  const serverEnv = buildServerEnv(db, fixtures, chromePath);
  const workerSecret = serverEnv.WORKER_SECRET;

  let server;
  let journeyResult;
  let failure = null;
  try {
    server = await bootNextServer(serverEnv);
    timeStart('total-journey');
    journeyResult = await runJourney(db, workerSecret);
    timeEnd('total-journey');
  } catch (error) {
    failure = error;
    log('error', `journey failed: ${error.message}`);
  }

  // Teardown (best-effort, evidence is written first)
  const s3Objects = fixtures ? fixtures.s3.listObjects() : [];
  const evidence = {
    runId: RUN_ID,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim(),
    verdict: failure || (journeyResult && journeyResult.steps.some((step) => !step.ok))
      ? 'FAILED'
      : 'CONTROLLED_JOINED_JOURNEY_VERIFIED',
    failure: failure ? { message: failure.message, stack: failure.stack } : null,
    environment: {
      node: process.version,
      next: 'next dev (Next 15)',
      database: db?.dbName,
      fixtureSiteUrl: fixtures?.site.url,
      fixtureProvidersUrl: fixtures?.providers.url,
      fixtureS3Url: fixtures?.s3.url,
      nextUrl: NEXT_URL,
      llm: 'deterministic fixture provider (PROPOSALOS_FIXTURE_LLM_ENABLED=true) — NO real inference',
      email: 'disabled (RESEND_API_KEY unset)',
      outbound: `only ${PROVIDER_FIXTURE_HOSTS} redirected to local fixtures; everything else blocked or loopback`,
    },
    journey: journeyResult ?? null,
    runLog,
    s3Objects,
  };

  const evidencePath = path.join(EVIDENCE_DIR, `journey-evidence-${RUN_ID}.json`);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  log('evidence', `evidence written to ${evidencePath}`);

  if (server?.child) {
    try {
      process.kill(-server.child.pid, 'SIGTERM');
    } catch {
      server.child.kill('SIGTERM');
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    if (server.child.exitCode === null) {
      try {
        process.kill(-server.child.pid, 'SIGKILL');
      } catch {
        server.child.kill('SIGKILL');
      }
    }
  }
  if (db) {
    await dropDatabase(db.dbName).catch(() => {});
    log('cleanup', `disposable database ${db.dbName} dropped`);
  }

  console.log('');
  console.log(`JOURNEY VERDICT: ${evidence.verdict}`);
  if (failure) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Unhandled journey error:', error);
  process.exit(1);
});
