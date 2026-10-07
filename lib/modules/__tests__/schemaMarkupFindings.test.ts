/**
 * Wave 5 (P1-33) — unit coverage for `runSchemaMarkupModule`'s own finding generation,
 * independent of the adapter layer (covered separately in wave5AdapterRepairs.test.ts).
 * No real network access: `safeFetch` is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (_opts: unknown, fn: (ctx: { signal?: AbortSignal }) => unknown) =>
    fn({}),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { safeFetch } from '@/lib/security/safeFetch';

import { runSchemaMarkupModule } from '../schemaMarkup';

function htmlWithNoSchema() {
  return '<html><head><title>Acme Dental</title></head><body>Welcome</body></html>';
}

function htmlWithLocalBusiness() {
  return `<html><head><script type="application/ld+json">
    {"@type":"LocalBusiness","name":"Acme Dental","address":"123 Main St","telephone":"555-1234"}
  </script></head><body></body></html>`;
}

describe('runSchemaMarkupModule (P1-33)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('produces real, evidence-bearing findings for schemas missing from the analyzed page', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => htmlWithNoSchema(),
    } as never);

    const result = await runSchemaMarkupModule({ url: 'https://acmedental.com' });

    expect(result.status).toBe('success');
    const data = (result.data as { data: { findings: unknown[] } }).data;
    expect(data.findings.length).toBeGreaterThan(0);
    for (const f of data.findings as Array<{ evidence: Array<{ pointer: string }> }>) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.evidence[0].pointer).toBe('https://acmedental.com');
    }
  });

  it('does not report a schema as missing when it is genuinely present', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => htmlWithLocalBusiness(),
    } as never);

    const result = await runSchemaMarkupModule({ url: 'https://acmedental.com' });
    const data = (
      result.data as { data: { schemasMissing: string[]; findings: Array<{ title: string }> } }
    ).data;

    expect(data.schemasMissing).not.toContain('LocalBusiness');
    expect(data.findings.some((f) => f.title.includes('Missing LocalBusiness'))).toBe(false);
  });

  it('reports the outer status as failed (not success) on a real fetch failure — parser/fetch failure is unavailable, not "missing schema"', async () => {
    vi.mocked(safeFetch).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    } as never);

    const result = await runSchemaMarkupModule({ url: 'https://acmedental.com' });

    expect(result.status).toBe('failed');
    expect(result.data).toBeNull();
  });
});
