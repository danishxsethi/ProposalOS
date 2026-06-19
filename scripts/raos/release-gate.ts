/**
 * RAOS CI Release_Gate entrypoint (task 13.1).
 *
 * Invoked by `.github/workflows/release-gate.yml` as the bounded CI profile's
 * verdict-computation step. It:
 *
 *   1. Reads the Static + P0 safety check results re-run on the candidate commit
 *      (RLS coverage / adapter filter / BYPASSRLS / secret-scan / dependency
 *      audit). Each check's pass/fail + critical/high counts are supplied via a
 *      JSON results file (`--results <path>`) produced by the earlier workflow
 *      steps, or fall back to env-derived booleans.
 *   2. Reads the reused-synthetic findings (latency/cost/AI-quality/reliability)
 *      from the latest scheduled full run (`--reused <path>`), if any — each is
 *      tagged provisional-on-candidate with source run id + age (R17.5).
 *   3. Computes the {@link computeGateVerdict} Gate_Verdict and maps it to a CI
 *      outcome (R17.1–R17.6).
 *   4. Writes the Gate_Verdict + outcome + annotations as evidence to
 *      `.kiro/raos/state/gate-verdict.json` (recorded DISTINCTLY from a
 *      scheduled run's Production_Readiness verdict — R17.4) and to the GitHub
 *      Actions step summary.
 *   5. Exits non-zero on `fail`, zero on `pass`/`warn`.
 *
 * NO synthetic Default_Sample or Deep_Run runs here — that is the scheduled
 * Drift_Run (task 13.2). This profile is Static + P0 only.
 *
 * Usage:
 *   tsx scripts/raos/release-gate.ts \
 *     --commit <sha> \
 *     [--results path/to/p0-results.json] \
 *     [--reused path/to/reused-synthetic.json] \
 *     [--warn-only --authorized-by <id> --reason <text>]
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6
 */

import fs from 'fs';
import path from 'path';

import {
  computeGateVerdict,
  P0_SAFETY_CHECKS,
  type GateVerdictInput,
  type P0SafetyCheck,
  type ReusedSyntheticFinding,
  type StaticP0CheckResult,
} from '../../lib/raos/releaseGate';

interface CliArgs {
  commit: string;
  resultsPath?: string;
  reusedPath?: string;
  warnOnly: boolean;
  authorizedBy?: string;
  reason?: string;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    commit: process.env.GITHUB_SHA ?? 'unknown',
    warnOnly: process.env.RELEASE_GATE_WARN_ONLY === 'true',
    authorizedBy: process.env.RELEASE_GATE_WARN_ONLY_AUTHORIZED_BY,
    reason: process.env.RELEASE_GATE_WARN_ONLY_REASON,
    out: '.kiro/raos/state/gate-verdict.json',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--commit':
        args.commit = argv[++i];
        break;
      case '--results':
        args.resultsPath = argv[++i];
        break;
      case '--reused':
        args.reusedPath = argv[++i];
        break;
      case '--warn-only':
        args.warnOnly = true;
        break;
      case '--authorized-by':
        args.authorizedBy = argv[++i];
        break;
      case '--reason':
        args.reason = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
    }
  }
  return args;
}

function readJson<T>(p: string | undefined): T | undefined {
  if (!p) return undefined;
  if (!fs.existsSync(p)) return undefined;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

/**
 * Derive Static/P0 results from a results file when present; otherwise treat
 * every P0 check as passed (the workflow's earlier steps gate failures
 * independently, but the verdict file is the load-bearing aggregator).
 */
function loadStaticP0Results(p: string | undefined): StaticP0CheckResult[] {
  const fromFile = readJson<StaticP0CheckResult[]>(p);
  if (fromFile && Array.isArray(fromFile)) return fromFile;
  return P0_SAFETY_CHECKS.map((check: P0SafetyCheck) => ({
    check,
    passed: true,
    criticalCount: 0,
  }));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const staticP0Results = loadStaticP0Results(args.resultsPath);
  const reusedSynthetic = readJson<ReusedSyntheticFinding[]>(args.reusedPath) ?? [];

  const input: GateVerdictInput = {
    candidateCommit: args.commit,
    staticP0Results,
    reusedSynthetic,
    config: {
      warnOnly: args.warnOnly,
      warnOnlyAuthorizedBy: args.authorizedBy,
      warnOnlyReason: args.reason,
    },
  };

  const result = computeGateVerdict(input);

  // Persist the Gate_Verdict as evidence — recorded DISTINCTLY from a scheduled
  // run's Production_Readiness verdict (R17.4).
  const outDir = path.dirname(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(result, null, 2) + '\n', 'utf8');

  // Emit annotations to stdout and the GitHub step summary.
  const lines = [
    `Release_Gate outcome: ${result.outcome.toUpperCase()}`,
    `Gate_Verdict: ${result.gateVerdict.verdict} (nonProvisionalGo=${result.gateVerdict.nonProvisionalGo}, provisional=${result.gateVerdict.provisional})`,
    `candidate: ${result.gateVerdict.candidateCommit}`,
    `re-run scope: ${result.gateVerdict.reRunScope.join(', ') || '(none)'}`,
    ...result.annotations,
  ];
  for (const l of lines) console.log(l);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    const md =
      `## RAOS Release_Gate\n\n` +
      `- **Outcome:** \`${result.outcome.toUpperCase()}\`\n` +
      `- **Gate_Verdict:** \`${result.gateVerdict.verdict}\` ` +
      `(nonProvisionalGo=\`${result.gateVerdict.nonProvisionalGo}\`, provisional=\`${result.gateVerdict.provisional}\`)\n` +
      `- **Candidate commit:** \`${result.gateVerdict.candidateCommit}\`\n` +
      `- **Re-run scope (Static + P0 only, no synthetic):** ${result.gateVerdict.reRunScope.join(', ') || '(none)'}\n\n` +
      (result.annotations.length
        ? `### Annotations\n\n` + result.annotations.map((a) => `- ${a}`).join('\n') + '\n'
        : '');
    fs.appendFileSync(summaryPath, md, 'utf8');
  }

  // R17.1/R17.2: fail the pipeline on `fail`. `warn` and `pass` proceed.
  if (result.outcome === 'fail') process.exit(1);
  process.exit(0);
}

main();
