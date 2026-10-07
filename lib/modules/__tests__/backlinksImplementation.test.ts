import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { validateFinding } from '@/lib/audit/findingContract';

import {
  normalizeBacklinkProviderResponse,
  normalizeDomain,
  runBacklinksModule,
  type BacklinkProvider,
} from '../backlinks';

const generatedAt = new Date().toISOString();

function provider(response: unknown): BacklinkProvider {
  return { id: 'fixture-provider', fetchProfile: vi.fn(async () => response) };
}

describe('backlinks provider-neutral implementation', () => {
  it('returns unavailable and makes no provider call when no provider is selected', async () => {
    const result = await runBacklinksModule({
      websiteUrl: 'https://www.acme.co.uk',
      businessName: 'Acme',
      city: 'Regina',
    });
    expect(result.execution?.state).toBe('unavailable');
    expect(result.findings).toEqual([]);
  });

  it('normalizes domains and deduplicates real backlink records', () => {
    const analysis = normalizeBacklinkProviderResponse('fixture-provider', {
      reportId: 'r1',
      reportUrl: 'https://provider.test/reports/r1',
      generatedAt,
      sourceScope: 'fresh index',
      backlinks: [
        {
          sourceUrl: 'https://www.Example.COM:443/page#section',
          targetUrl: 'https://www.acme.test/',
          anchorText: 'Acme',
          follow: true,
        },
        {
          sourceUrl: 'https://example.com/page',
          targetUrl: 'https://acme.test/',
          anchorText: 'Acme',
          follow: true,
        },
        {
          sourceUrl: 'https://news.example.co.uk/story',
          targetUrl: 'https://acme.test/',
          follow: false,
        },
      ],
    });

    expect(analysis.backlinks).toHaveLength(2);
    expect(analysis.referringDomains).toEqual(['example.com', 'news.example.co.uk']);
    expect(analysis.followCount).toBe(1);
    expect(analysis.nofollowCount).toBe(1);
    expect(normalizeDomain('http://www.Example.COM/path')).toBe('example.com');
  });

  it('reports a genuine provider-observed zero with valid evidence', async () => {
    const result = await runBacklinksModule(
      { websiteUrl: 'https://acme.test', businessName: 'Acme', city: 'Regina' },
      undefined,
      provider({
        reportId: 'zero',
        reportUrl: 'https://provider.test/reports/zero',
        generatedAt,
        sourceScope: 'fresh index',
        backlinks: [],
        totalBacklinks: 0,
        totalReferringDomains: 0,
      })
    );

    expect(result.execution?.state).toBe('complete');
    expect(result.findings[0].title).toContain('No Backlinks Reported');
    expect(validateFinding({ ...result.findings[0], module: 'backlinks' }).success).toBe(true);
  });

  it('labels provider-specific authority and never calls discovered URLs', async () => {
    const fetchProfile = vi.fn(async () => ({
      reportId: 'r2',
      reportUrl: 'https://provider.test/reports/r2',
      generatedAt,
      sourceScope: 'live index',
      backlinks: [
        {
          sourceUrl: 'https://source.test/page',
          targetUrl: 'https://acme.test/',
          anchorText: 'Acme',
        },
      ],
      authority: { metric: 'Domain Rating', value: 12, scaleMax: 100 },
    }));
    const result = await runBacklinksModule(
      { websiteUrl: 'https://acme.test', businessName: 'Acme', city: 'Regina' },
      undefined,
      { id: 'fixture-provider', fetchProfile }
    );

    expect(fetchProfile).toHaveBeenCalledTimes(1);
    expect(fetchProfile).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'acme.test', maxResults: 1_000 })
    );
    expect(result.findings[0].title).toContain('fixture-provider Domain Rating');
    expect(result.findings[0].description).toContain('not a Google ranking score');
  });

  it('rejects malformed provider responses and unsafe backlink schemes', async () => {
    const malformed = await runBacklinksModule(
      { websiteUrl: 'https://acme.test', businessName: 'Acme', city: 'Regina' },
      undefined,
      provider({ backlinks: [] })
    );
    expect(malformed.execution?.state).toBe('failed');
    expect(malformed.findings).toEqual([]);

    const filtered = normalizeBacklinkProviderResponse('fixture-provider', {
      reportId: 'r3',
      reportUrl: 'https://provider.test/reports/r3',
      generatedAt,
      sourceScope: 'index',
      backlinks: [{ sourceUrl: 'javascript:alert(1)', targetUrl: 'https://acme.test/' }],
    });
    expect(filtered.backlinks).toEqual([]);
  });

  it('propagates caller abort to the selected provider', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    const abortingProvider: BacklinkProvider = {
      id: 'fixture-provider',
      fetchProfile: vi.fn(async ({ signal }) => Promise.reject(signal?.reason)),
    };

    await expect(
      runBacklinksModule(
        {
          websiteUrl: 'https://acme.test',
          businessName: 'Acme',
          city: 'Regina',
          signal: controller.signal,
        },
        undefined,
        abortingProvider
      )
    ).rejects.toThrow(/cancelled/);
  });
});
