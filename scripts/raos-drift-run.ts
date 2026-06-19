#!/usr/bin/env npx tsx
/**
 * Scheduled Drift_Run runner — RAOS WS5 (task 13.2, Requirement 18.1).
 *
 * Operational glue invoked by the cron-scheduled GitHub Actions workflow
 * (`.github/workflows/drift-run.yml`). It composes the testable
 * {@link runDriftRun} orchestration core (`lib/raos/driftRun.ts`) with the
 * real, READ-ONLY Audit_System kernel for the FULL run, and runs the opt-in
 * Deep_Run synthetic across >= 5 industries.
 *
 * The Audit_System stays read-only to production and Notion (the RAOS
 * non-destructive boundary, R24). This script only reads the engine's findings
 * and writes the four sinks under `.kiro/raos/artifacts/<runId>/`.
 *
 * Downstream handling (artifact retention + append-only ledger bump → task 13.3;
 * Regression / new-Critical alerting → task 13.4) is intentionally out of scope
 * here; this runner produces the Drift_Run evidence those tasks consume.
 *
 * Usage:
 *   npm run raos:drift-run
 *   DRIFT_RUN_INDUSTRIES="aero,auto,fin,health,retail" npm run raos:drift-run
 */
import 'dotenv/config';
import * as path from 'path';

import * as fs from 'fs-extra';

import {
  CHECK_REGISTRY,
  runChecks,
  type ArtifactSinks,
  type Capability,
  type Finding,
  type SelfBudget,
} from '../lib/audit-engine';
import {
  DEFAULT_DRIFT_RUN_INDUSTRIES,
  runDriftRun,
  type DeepRunPort,
  type DeepRunSample,
  type DriftRunEnginePort,
} from '../lib/raos/driftRun';

/** All capabilities a scheduled FULL Drift_Run supplies (vs the bounded PR gate). */
const FULL_RUN_CAPABILITIES: Capability[] = [
  'notionRead',
  'nonProdDb',
  'gcpVertex',
  'langSmith',
  'testExecution',
  'secretScan',
  'costInstrumentation',
];

function resolveIndustries(): string[] {
  const raw = (process.env.DRIFT_RUN_INDUSTRIES ?? '').trim();
  if (!raw) return [...DEFAULT_DRIFT_RUN_INDUSTRIES];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function resolveDeepRunCount(): number {
  const raw = (process.env.DRIFT_RUN_DEEP_RUNS_PER_INDUSTRY ?? '').trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/**
 * Build the FULL-run engine port over a precomputed, read-only kernel result.
 * The kernel is async while the orchestrator's port is synchronous, so the
 * caller runs the kernel first and closes its `sinks` into this port. The
 * engine's findings become `V_open` and the exercised checks the scope guard.
 */
function makeEnginePort(sinks: ArtifactSinks): DriftRunEnginePort {
  return () => {
    const exercised = new Set<string>();
    for (const f of sinks.findings) exercised.add(f.sourceCheckId);
    // Include every non-blocked registry check as exercised on a FULL run.
    for (const check of CHECK_REGISTRY) {
      if (!sinks.blockedChecks.some((b) => b.checkId === check.id)) {
        exercised.add(check.id);
      }
    }
    const selfBudget: SelfBudget = {
      maxRuntimeMs: Number.MAX_SAFE_INTEGER,
      maxCostUsd: Number.MAX_SAFE_INTEGER,
      measuredRuntimeMs: 0,
      measuredCostUsd: 0,
      defaultSampleFitsBudget: true,
      capHit: null,
      partial: false,
    };
    return {
      openFindings: sinks.findings as Finding[],
      exercisedChecks: [...exercised],
      selfBudget,
      completed: true,
    };
  };
}

/**
 * Deep_Run synthetic port. A real warm-run percentile measurement is heavy and
 * environment-bound; the scheduled runner wires the synthetic harness in CI.
 * Until that integration lands, it returns a conservative empty sample set,
 * which makes the Deep_Run fall back to p50 gating and record a coverage gap
 * (R12.6) rather than fabricate warm percentiles.
 */
function makeDeepRunPort(): DeepRunPort {
  return ({ industries }): DeepRunSample[] => {
    // No fabricated latency samples — fall back to p50 gating honestly (R12.6).
    void industries;
    return [];
  };
}

async function main(): Promise<void> {
  const runId = `drift-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const industries = resolveIndustries();
  const deepRunRunsPerIndustry = resolveDeepRunCount();

  // Precompute the read-only FULL kernel run (async) before the sync port runs.
  const sinks = await runChecks({
    checks: CHECK_REGISTRY,
    availableCapabilities: FULL_RUN_CAPABILITIES,
  });

  const result = runDriftRun({
    runId,
    industries,
    engine: makeEnginePort(sinks),
    deepRun: makeDeepRunPort(),
    deepRunRunsPerIndustry,
    existingLatencyGating: { p50Ms: 0, sourceRunId: 'default-sample' },
  });

  // Persist the four engine sinks + the Drift_Run evidence (read-only boundary).
  const outDir = path.join(process.cwd(), '.kiro', 'raos', 'artifacts', runId);
  await fs.ensureDir(outDir);
  await fs.writeJson(path.join(outDir, 'machine-findings.json'), sinks.machineFindings, {
    spaces: 2,
  });
  await fs.writeJson(path.join(outDir, 'human-report.json'), sinks.humanReport, { spaces: 2 });
  await fs.writeJson(path.join(outDir, 'open-questions.json'), sinks.openQuestions, { spaces: 2 });
  await fs.writeJson(path.join(outDir, 'blocked-checks.json'), sinks.blockedChecks, { spaces: 2 });
  await fs.writeJson(path.join(outDir, 'drift-run-result.json'), result, { spaces: 2 });

  // eslint-disable-next-line no-console
  console.log(
    `Drift_Run ${runId} complete: FULL audit across ${result.industries.length} industries ` +
      `(${result.openFindings.length} open findings); Deep_Run gating=${result.deepRun.result?.gatingMode ?? 'n/a'}.`
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Drift_Run failed:', err);
  process.exit(1);
});
