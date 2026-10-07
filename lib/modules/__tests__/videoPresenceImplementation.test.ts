import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/cache/moduleCache', () => ({
  withModuleCache: async (_key: unknown, _options: unknown, fn: () => Promise<unknown>) => fn(),
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

import { runVideoModule, validateYouTubeChannelUrl } from '../videoPresence';

class Tracker {
  calls: string[] = [];
  addApiCall(name: string) {
    this.calls.push(name);
  }
}

function channelPage() {
  return `
    <html>
      <head>
        <meta property="og:title" content="Acme Dental Regina" />
        <meta property="og:description" content="Official Acme Dental channel in Regina" />
        <meta itemprop="channelId" content="UC123456789" />
        <link rel="canonical" href="https://www.youtube.com/channel/UC123456789" />
      </head>
    </html>`;
}

function feed(publishedAt: string) {
  return `<?xml version="1.0"?>
    <feed>
      <entry>
        <title>Dental care update</title>
        <link href="https://www.youtube.com/watch?v=video1" />
        <published>${publishedAt}</published>
      </entry>
    </feed>`;
}

function installOwnedChannel(publishedAt: string) {
  vi.mocked(safeFetch).mockImplementation(async (url) => {
    const value = String(url);
    if (value === 'https://acme.test') {
      return new Response(
        '<a href="https://www.youtube.com/@acmedental">YouTube</a><iframe src="https://youtube.com/embed/video1"></iframe>',
        { status: 200 }
      );
    }
    if (value.includes('/feeds/videos.xml')) {
      return new Response(feed(publishedAt), { status: 200 });
    }
    if (value.includes('youtube.com/@acmedental')) {
      return new Response(channelPage(), { status: 200 });
    }
    throw new Error(`Unexpected URL ${value}`);
  });
}

describe('videoPresence real public-data implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERP_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates channel URLs and rejects video/embed URLs', () => {
    expect(validateYouTubeChannelUrl('https://youtube.com/@acmedental')).toContain('@acmedental');
    expect(validateYouTubeChannelUrl('https://youtube.com/watch?v=x')).toBeNull();
    expect(validateYouTubeChannelUrl('https://youtube.com/embed/x')).toBeNull();
  });

  it('observes an active owned channel from the website and public feed', async () => {
    installOwnedChannel(new Date().toISOString());
    const result = await runVideoModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteUrl: 'https://acme.test',
      competitors: [],
    });

    expect(result.execution?.state).toBe('complete');
    expect(result.evidenceSnapshots[0].rawResponse.channel).toMatchObject({
      status: 'verified',
      metricsStatus: 'available',
      channelId: 'UC123456789',
    });
    expect(result.findings.some((finding) => finding.title.includes('Not Published'))).toBe(false);
  });

  it('emits a stale finding only from a real old feed timestamp', async () => {
    installOwnedChannel('2020-01-01T00:00:00.000Z');
    const result = await runVideoModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteUrl: 'https://acme.test',
      competitors: [],
    });

    const finding = result.findings.find((item) => item.title.includes('Not Published'));
    expect(finding).toBeDefined();
    expect(validateFinding({ ...finding, module: 'videoPresence' }).success).toBe(true);
  });

  it('keeps missing channel metrics partial and never labels the channel stale', async () => {
    vi.mocked(safeFetch).mockImplementation(async (url) => {
      if (String(url) === 'https://acme.test') {
        return new Response('<a href="https://youtube.com/@acmedental">YouTube</a>', {
          status: 200,
        });
      }
      return new Response('<meta property="og:title" content="Acme Dental Regina">', {
        status: 200,
      });
    });

    const result = await runVideoModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteUrl: 'https://acme.test',
      competitors: [],
    });
    expect(result.execution?.state).toBe('partial');
    expect(result.findings.some((finding) => finding.title.includes('Not Published'))).toBe(false);
  });

  it('emits no-channel only after a successful bounded search', async () => {
    process.env.SERP_API_KEY = 'test-key';
    vi.mocked(safeFetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ organic_results: [] }), { status: 200 }))
    );
    const tracker = new Tracker();

    const result = await runVideoModule(
      {
        businessName: 'Acme Dental',
        city: 'Regina',
        industry: 'Dental',
        websiteUrl: 'https://acme.test',
        competitors: ['Canonical Competitor'],
      },
      tracker as never
    );

    expect(result.findings.some((finding) => finding.title.includes('No Matching YouTube'))).toBe(
      true
    );
    expect(tracker.calls).toEqual(['SERP_API', 'SERP_API']);
    for (const finding of result.findings) {
      expect(validateFinding({ ...finding, module: 'videoPresence' }).success).toBe(true);
    }
  });

  it('does not emit false no-channel/stale findings when provider output is malformed', async () => {
    process.env.SERP_API_KEY = 'test-key';
    vi.mocked(safeFetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ organic_results: 'bad' }), { status: 200 }))
    );

    const result = await runVideoModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteUrl: 'https://acme.test',
      competitors: [],
    });

    expect(result.execution?.state).toBe('partial');
    expect(
      result.findings.some((finding) => /No Matching YouTube|Not Published/.test(finding.title))
    ).toBe(false);
  });

  it('keeps an ambiguous same-name channel partial without claiming ownership', async () => {
    process.env.SERP_API_KEY = 'test-key';
    vi.mocked(safeFetch).mockImplementation(async (url) => {
      if (String(url) === 'https://acme.test')
        return new Response('<html></html>', { status: 200 });
      return new Response('<meta property="og:title" content="Acme Fan Videos">', { status: 200 });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              organic_results: [
                {
                  title: 'Acme Fan Videos',
                  snippet: 'Unofficial clips',
                  link: 'https://youtube.com/@acmefans',
                },
              ],
            }),
            { status: 200 }
          )
      )
    );

    const result = await runVideoModule({
      businessName: 'Acme Dental',
      city: 'Regina',
      industry: 'Dental',
      websiteUrl: 'https://acme.test',
      competitors: [],
    });
    expect(result.execution?.state).toBe('partial');
    expect(result.evidenceSnapshots[0].rawResponse.channel.status).toBe('ambiguous');
    expect(result.findings.some((finding) => finding.title.includes('No Matching YouTube'))).toBe(
      false
    );
  });

  it('propagates caller abort through website analysis', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('cancelled', 'AbortError'));
    vi.mocked(safeFetch).mockRejectedValue(controller.signal.reason);

    await expect(
      runVideoModule({
        businessName: 'Acme Dental',
        city: 'Regina',
        industry: 'Dental',
        websiteUrl: 'https://acme.test',
        competitors: [],
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelled/);
  });
});
