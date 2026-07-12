import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (
    options: { signal?: AbortSignal },
    fn: (context: { signal: AbortSignal }) => Promise<unknown>
  ) => fn({ signal: options.signal || new AbortController().signal }),
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));

import { validateFinding } from '@/lib/audit/findingContract';
import { safeFetch } from '@/lib/security/safeFetch';

import { runSocialDeepModule, validateSocialProfileUrl } from '../socialDeep';

class Tracker {
  calls: string[] = [];
  addApiCall(name: string) {
    this.calls.push(name);
  }
}

describe('socialDeep real implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERP_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies an owned profile discovered from the business website', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      new Response('<title>Acme Dental Regina</title><a href="https://acme.test">Website</a>', {
        status: 200,
      })
    );

    const result = await runSocialDeepModule({
      websiteUrl: 'https://acme.test',
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteDiscoverySucceeded: true,
      discoveredUrls: [{ platform: 'facebook', url: 'https://facebook.com/acmedental' }],
    });

    const snapshot = result.evidenceSnapshots[0].rawResponse;
    expect(snapshot.observations[0]).toMatchObject({
      platform: 'facebook',
      status: 'verified',
      source: 'website',
    });
    expect(result.execution?.state).toBe('partial');
    for (const finding of result.findings) {
      expect(validateFinding({ ...finding, module: 'socialDeep' }).success).toBe(true);
    }
  });

  it('rejects share/content URLs as profiles', () => {
    expect(
      validateSocialProfileUrl(
        'facebook',
        'https://facebook.com/sharer/sharer.php?u=https://acme.test'
      ).ok
    ).toBe(false);
    expect(validateSocialProfileUrl('youtube', 'https://youtube.com/watch?v=abc').ok).toBe(false);
    expect(validateSocialProfileUrl('instagram', 'https://instagram.com/p/abc').ok).toBe(false);
  });

  it('returns unavailable with no negative finding and no phantom cost when unconfigured', async () => {
    const tracker = new Tracker();
    const result = await runSocialDeepModule(
      {
        websiteUrl: 'https://acme.test',
        businessName: 'Acme Dental',
        city: 'Regina',
        industry: 'Dental',
        websiteDiscoverySucceeded: true,
        discoveredUrls: [],
      },
      tracker as never
    );

    expect(result.execution?.state).toBe('unavailable');
    expect(result.findings).toEqual([]);
    expect(tracker.calls).toEqual([]);
  });

  it('keeps a private/inaccessible profile partial without a customer-negative finding', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response('', { status: 403 }));
    const result = await runSocialDeepModule({
      websiteUrl: 'https://acme.test',
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      discoveredUrls: [{ platform: 'instagram', url: 'https://instagram.com/acmedental' }],
    });

    expect(result.execution?.state).toBe('partial');
    expect(result.evidenceSnapshots[0].rawResponse.observations[0].status).toBe('inaccessible');
    expect(result.findings.some((finding) => /Missing|No Active/.test(finding.title))).toBe(false);
  });

  it('emits bounded-search absence findings only after successful provider checks', async () => {
    process.env.SERP_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ organic_results: [] }), { status: 200 }))
    );
    const tracker = new Tracker();

    const result = await runSocialDeepModule(
      {
        websiteUrl: 'https://acme.test',
        businessName: 'Acme Dental',
        city: 'Regina',
        industry: 'Dental',
        websiteDiscoverySucceeded: true,
        discoveredUrls: [],
      },
      tracker as never
    );

    expect(result.execution?.state).toBe('complete');
    expect(result.findings.some((finding) => finding.title.includes('No Public Social'))).toBe(
      true
    );
    expect(tracker.calls).toHaveLength(5);
    for (const finding of result.findings) {
      expect(validateFinding({ ...finding, module: 'socialDeep' }).success).toBe(true);
    }
  });

  it('treats malformed provider responses as unavailable rather than verified absence', async () => {
    process.env.SERP_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ organic_results: 'bad' }), { status: 200 }))
    );

    const result = await runSocialDeepModule({
      websiteUrl: 'https://acme.test',
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      discoveredUrls: [],
    });

    expect(result.execution?.state).toBe('unavailable');
    expect(result.findings).toEqual([]);
  });

  it('propagates caller abort through provider discovery', async () => {
    process.env.SERP_API_KEY = 'test-key';
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(controller.signal.reason))
    );

    await expect(
      runSocialDeepModule({
        websiteUrl: 'https://acme.test',
        businessName: 'Acme Dental',
        city: 'Regina',
        industry: 'Dental',
        discoveredUrls: [],
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelled/);
  });
});
