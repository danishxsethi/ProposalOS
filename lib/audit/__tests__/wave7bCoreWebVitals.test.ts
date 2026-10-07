import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/cache/redisCache', () => ({ redisCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: vi.fn() }));
vi.mock('@/lib/observability/context', () => ({
  withChildObservabilityContext: (_ctx: unknown, fn: () => unknown) => fn(),
}));
vi.mock('@/lib/observability/MetricsRecorder', () => ({ MetricsRecorder: { auditRun: vi.fn() } }));
vi.mock('@/lib/tracing', () => ({ createParentTrace: vi.fn(async () => undefined) }));
vi.mock('langsmith', () => ({ RunTree: vi.fn() }));

import { validateFinding } from '@/lib/audit/findingContract';

import { MODULE_REGISTRY } from '../runner';

describe('coreWebVitals INP adapter (P2-44)', () => {
  it('emits a contract-valid lab-provenance INP finding and ignores obsolete FID', async () => {
    const adapter = MODULE_REGISTRY.find((module) => module.name === 'coreWebVitals')!.run;
    const result = await adapter(
      {
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        url: 'https://acme.test',
        dependencyResults: {
          website: {
            lighthouseResult: {
              audits: {
                'interaction-to-next-paint': { numericValue: 640 },
                'max-potential-fid': { numericValue: 10 },
              },
            },
          },
        },
      },
      {} as never
    );

    expect(result.status).toBe('COMPLETE');
    const finding = result.data.findings.find((item: { title: string }) =>
      item.title.startsWith('Interaction to Next Paint:')
    );
    expect(finding).toMatchObject({
      metrics: {
        metric: 'INP',
        unit: 'milliseconds',
        provenance: 'lighthouse_lab_single_run',
      },
    });
    expect(finding.description).toContain('lab, single Lighthouse run');
    expect(validateFinding({ ...finding, module: 'coreWebVitals' }).success).toBe(true);
  });

  it('does not fabricate an INP finding when Lighthouse has no INP observation', async () => {
    const adapter = MODULE_REGISTRY.find((module) => module.name === 'coreWebVitals')!.run;
    const result = await adapter(
      {
        auditId: 'audit-1',
        tenantId: 'tenant-1',
        url: 'https://acme.test',
        dependencyResults: {
          website: {
            lighthouseResult: { audits: { 'max-potential-fid': { numericValue: 900 } } },
          },
        },
      },
      {} as never
    );

    expect(result.data.findings).toEqual([]);
  });
});
