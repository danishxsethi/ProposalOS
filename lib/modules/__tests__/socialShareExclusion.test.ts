/**
 * Wave 7 — `social.ts` hardening:
 * - P2-32: a generic share/embed/widget/watch link (present on almost any site via
 *   share buttons) is not evidence of the business's OWN profile and must be
 *   rejected, mirroring the same exclusion `socialDeep` already enforces.
 * - P2-31: `social`'s platform vocabulary must match `socialDeep`'s so a
 *   free, already-collected discovery is never silently dropped downstream.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security/safeFetch', () => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/resilience/withProviderResilience', () => ({
  withProviderResilience: async (_opts: unknown, fn: (ctx: Record<string, never>) => unknown) =>
    fn({}),
}));

import { safeFetch } from '@/lib/security/safeFetch';

import { SOCIAL_DEEP_PLATFORMS } from '../socialDeep';
import { runSocialModule } from '../social';

function htmlResponse(body: string) {
  return { ok: true, status: 200, text: async () => body } as Response;
}

describe('runSocialModule share/embed exclusion (P2-32)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not report a Facebook profile from a generic share-dialog link', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      htmlResponse(
        '<a href="https://www.facebook.com/sharer/sharer.php?u=https://acme.test">Share</a>'
      )
    );

    const result = await runSocialModule({ websiteUrl: 'https://acme.test', businessName: 'Acme' });
    const data = result.data as { platformsFound: string[]; totalCount: number };
    expect(data.platformsFound).not.toContain('facebook');
    expect(data.totalCount).toBe(0);
  });

  it('still reports a real Facebook business page link', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      htmlResponse('<a href="https://www.facebook.com/AcmeDental">Follow us</a>')
    );

    const result = await runSocialModule({ websiteUrl: 'https://acme.test', businessName: 'Acme' });
    const data = result.data as { platformsFound: string[]; totalCount: number };
    expect(data.platformsFound).toContain('facebook');
    expect(data.totalCount).toBe(1);
  });

  it('does not report a YouTube profile from a generic embed link', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      htmlResponse('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>')
    );

    const result = await runSocialModule({ websiteUrl: 'https://acme.test', businessName: 'Acme' });
    const data = result.data as { platformsFound: string[] };
    expect(data.platformsFound).not.toContain('youtube');
  });
});

describe('social/socialDeep platform vocabulary alignment (P2-31)', () => {
  it('never discovers a platform that socialDeep cannot validate', async () => {
    vi.mocked(safeFetch).mockResolvedValue(
      htmlResponse(
        [
          '<a href="https://www.facebook.com/AcmeDental">FB</a>',
          '<a href="https://www.instagram.com/acmedental">IG</a>',
          '<a href="https://twitter.com/acmedental">Twitter</a>',
        ].join('')
      )
    );

    const result = await runSocialModule({ websiteUrl: 'https://acme.test', businessName: 'Acme' });
    const data = result.data as { platformsFound: string[] };
    for (const platform of data.platformsFound) {
      expect(SOCIAL_DEEP_PLATFORMS).toContain(platform);
    }
  });
});
