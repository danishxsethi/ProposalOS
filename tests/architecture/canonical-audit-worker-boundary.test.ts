import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('canonical audit worker boundary', () => {
  it.each([
    'lib/pipeline/stages/auditStage.ts',
    'lib/graph/delivery-graph.ts',
    'lib/outreach/AutomatedOutreachOrchestrator.ts',
  ])('%s enqueues and executes through the worker', (path) => {
    const code = source(path);
    expect(code).toContain('dispatchAuditExecution');
    expect(code).toContain('processAuditJob');
    expect(code).not.toMatch(/import\s*\{[^}]*\brunAudit\b[^}]*\}\s*from\s*['"][^'"]*audit\/runner['"]|\bawait\s+runAudit\s*\(/);
  });

  it('does not short-circuit audits from URL-only cache metadata', () => {
    const code = source('lib/audit/runner.ts');
    expect(code).not.toContain("redisCache.get('audit'");
    expect(code).not.toContain('generateUrlHash');
  });

  it('does not interpret a raw tenant header as the authenticated tenant', () => {
    const code = source('lib/tenant/context.ts');
    expect(code).not.toContain("headerList.get('x-tenant-id')");
  });
});
