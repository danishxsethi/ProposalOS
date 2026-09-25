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
  const result = spawnSync(
    'npm',
    ['audit', ...(omitDev ? ['--omit=dev'] : []), '--audit-level=high', '--json'],
    { encoding: 'utf8' }
  );
  let report: AuditReport;
  try {
    report = JSON.parse(result.stdout) as AuditReport;
  } catch {
    process.stderr.write(result.stderr || result.stdout || 'npm audit returned no JSON output\n');
    throw new Error('Unable to parse npm audit JSON');
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
