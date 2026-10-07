import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type AuditReport = {
  metadata?: {
    vulnerabilities?: {
      low?: number;
      moderate?: number;
      high?: number;
      critical?: number;
      total?: number;
    };
  };
  vulnerabilities?: Record<string, unknown>;
};

function runAudit(omitDev: boolean): AuditReport {
  const args = ['audit', ...(omitDev ? ['--omit=dev'] : []), '--audit-level=high', '--json'];
  const npmExecPath = process.env.npm_execpath;
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...args], { encoding: 'utf8' })
    : spawnSync('npm', args, {
        encoding: 'utf8',
        // Windows exposes npm as a .cmd shim, which requires a shell to spawn.
        shell: process.platform === 'win32',
      });

  if (result.error) {
    throw new Error(`Unable to run npm audit: ${result.error.message}`);
  }

  const stdout = result.stdout ?? '';
  if (!stdout.trim()) {
    process.stderr.write(result.stderr || 'npm audit returned no JSON output\n');
    throw new Error(`npm audit returned no report (exit ${result.status ?? 'unknown'})`);
  }

  let report: AuditReport;
  try {
    report = JSON.parse(stdout) as AuditReport;
  } catch {
    process.stderr.write(result.stderr || stdout);
    throw new Error('Unable to parse npm audit JSON');
  }
  if (!report || typeof report !== 'object') {
    throw new Error('npm audit JSON did not contain a report object');
  }

  mkdirSync(join(process.cwd(), 'docs/security/audit-evidence'), { recursive: true });
  writeFileSync(
    join(
      process.cwd(),
      'docs/security/audit-evidence',
      omitDev ? 'npm-audit-production.json' : 'npm-audit-full.json'
    ),
    `${JSON.stringify(report, null, 2)}\n`
  );

  const counts = report.metadata?.vulnerabilities;
  if (!counts) throw new Error('npm audit JSON is missing vulnerability counts');
  const scope = omitDev ? 'production' : 'all dependencies';
  console.log(
    `${scope}: critical=${counts.critical ?? 0} high=${counts.high ?? 0} moderate=${counts.moderate ?? 0} low=${counts.low ?? 0}`
  );
  return report;
}

const production = runAudit(true);
const allDependencies = runAudit(false);

if ((production.metadata?.vulnerabilities?.critical ?? 0) > 0) {
  throw new Error('Production dependency audit has CRITICAL advisories');
}
if ((production.metadata?.vulnerabilities?.high ?? 0) > 0) {
  throw new Error('Production dependency audit has HIGH advisories');
}
if ((allDependencies.metadata?.vulnerabilities?.critical ?? 0) > 0) {
  throw new Error('Full dependency audit has CRITICAL advisories');
}
if ((allDependencies.metadata?.vulnerabilities?.high ?? 0) > 0) {
  throw new Error('Full dependency audit has HIGH advisories');
}

console.log('Dependency audit policy satisfied: no HIGH or CRITICAL advisories.');
