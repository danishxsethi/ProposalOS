// @vitest-environment node
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '../..');

function readPackageVersion(entryPath: string, packageName: string): string {
  let currentDir = path.dirname(entryPath);

  while (true) {
    const manifestPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) return manifest.version;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) throw new Error(`Could not locate ${packageName} package.json`);
    currentDir = parentDir;
  }
}

describe('PostgreSQL OpenTelemetry privacy', () => {
  it('resolves the patched pg instrumentation through the active auto-instrumentation package', () => {
    const rootRequire = createRequire(path.join(rootDir, 'package.json'));
    const autoInstrumentationEntry = rootRequire.resolve('@opentelemetry/auto-instrumentations-node');
    const autoInstrumentationRequire = createRequire(autoInstrumentationEntry);
    const pgInstrumentationEntry = autoInstrumentationRequire.resolve(
      '@opentelemetry/instrumentation-pg'
    );
    const version = readPackageVersion(pgInstrumentationEntry, '@opentelemetry/instrumentation-pg');
    const [major, minor] = version.split('.').map(Number);
    const patched = major > 0 || (major === 0 && minor >= 73);

    const otelSource = fs.readFileSync(path.join(rootDir, 'lib/observability/otel.ts'), 'utf-8');
    expect(otelSource).toContain("'@opentelemetry/instrumentation-pg': {");
    expect(otelSource).toContain('enabled: true');
    expect(patched, `resolved @opentelemetry/instrumentation-pg ${version}`).toBe(true);
  });
});
