// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { validateUrl } = vi.hoisted(() => ({ validateUrl: vi.fn() }));
vi.mock('@/lib/security/urlValidator', () => ({ validateUrl }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { safeFetch, SsrfBlockedError } from '@/lib/security/safeFetch';

const realFetch = globalThis.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  validateUrl.mockResolvedValue({ isValid: true });
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('Wave 4 shared network boundary', () => {
  it('strips sensitive headers on a cross-origin redirect', async () => {
    mockFetch
      .mockResolvedValueOnce({
        status: 302,
        headers: new Headers({ location: 'https://other.example/path' }),
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      })
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    await safeFetch('https://start.example/path', {
      headers: { Authorization: 'Bearer secret', Cookie: 'session=secret', 'X-Keep': 'ok' },
    });

    const secondHeaders = new Headers(mockFetch.mock.calls[1][1].headers);
    expect(secondHeaders.get('authorization')).toBeNull();
    expect(secondHeaders.get('cookie')).toBeNull();
    expect(secondHeaders.get('x-keep')).toBe('ok');
  });

  it('rejects a response whose declared body exceeds the shared limit', async () => {
    mockFetch.mockResolvedValue(
      new Response('oversized', { headers: { 'content-length': '9' }, status: 200 })
    );

    await expect(
      safeFetch('https://public.example', undefined, { maxResponseBytes: 8 })
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
