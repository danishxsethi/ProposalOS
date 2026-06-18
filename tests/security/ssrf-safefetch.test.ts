// @vitest-environment node
/**
 * tests/security/ssrf-safefetch.test.ts
 *
 * SSRF prevention tests for safeFetch, safeFetchResponseDerived, and
 * validateForBrowserNavigation [#5].
 *
 * Tests:
 *   1. Cloud metadata IP (169.254.169.254) → blocked
 *   2. Private IP ranges (10.x, 172.16.x, 192.168.x) → blocked
 *   3. Loopback (127.0.0.1, localhost) → blocked
 *   4. file:// scheme → blocked
 *   5. Redirect to metadata (302 → 169.254.169.254) → blocked at hop
 *   6. page.goto to metadata (validateForBrowserNavigation) → blocked
 *   7. safeFetchResponseDerived rejects non-allowlisted hosts
 *   8. ftp:// and data: schemes → blocked
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock validateUrl to control SSRF decisions without real DNS ──────────────

const mockValidateUrl = vi.fn();

vi.mock('@/lib/security/urlValidator', () => ({
  validateUrl: (...args: unknown[]) => mockValidateUrl(...args),
  default: (...args: unknown[]) => mockValidateUrl(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import AFTER mocks registered
import {
  safeFetch,
  safeFetchResponseDerived,
  SsrfBlockedError,
  validateForBrowserNavigation,
} from '@/lib/security/safeFetch';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allowUrl() {
  mockValidateUrl.mockResolvedValue({ isValid: true, sanitizedUrl: undefined });
}

function blockUrl(reason: string) {
  mockValidateUrl.mockResolvedValue({ isValid: false, error: reason });
}

function allowThenBlock(reason: string) {
  mockValidateUrl
    .mockResolvedValueOnce({ isValid: true, sanitizedUrl: undefined })
    .mockResolvedValueOnce({ isValid: false, error: reason });
}

// Mock global fetch for redirect tests
const realFetch = globalThis.fetch;
const mockFetch = vi.fn();

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    status: 200,
    ok: true,
    headers: new Headers(),
    text: async () => '<html></html>',
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ─── 1. Cloud metadata IP ─────────────────────────────────────────────────────

describe('SSRF: cloud metadata blocking', () => {
  it('blocks direct fetch to 169.254.169.254', async () => {
    blockUrl('Blocked IP address: 169.254.169.254');

    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      SsrfBlockedError
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks fetch to metadata.google.internal', async () => {
    blockUrl('Blocked hostname: metadata.google.internal');

    await expect(safeFetch('http://metadata.google.internal/computeMetadata/v1/')).rejects.toThrow(
      SsrfBlockedError
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── 2. Private IP ranges ─────────────────────────────────────────────────────

describe('SSRF: private IP blocking', () => {
  it('blocks 10.0.0.1 (Class A private)', async () => {
    blockUrl('Blocked IP address: 10.0.0.1');
    await expect(safeFetch('http://10.0.0.1/admin')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks 172.16.0.1 (Class B private)', async () => {
    blockUrl('Blocked IP address: 172.16.0.1');
    await expect(safeFetch('http://172.16.0.1/')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks 192.168.1.1 (Class C private)', async () => {
    blockUrl('Blocked IP address: 192.168.1.1');
    await expect(safeFetch('http://192.168.1.1/')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks hostname resolving to private IP', async () => {
    blockUrl('DNS resolution blocked: internal-service.corp resolves to blocked IP 10.0.0.5');
    await expect(safeFetch('http://internal-service.corp/')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── 3. Loopback ──────────────────────────────────────────────────────────────

describe('SSRF: loopback blocking', () => {
  it('blocks 127.0.0.1', async () => {
    blockUrl('Blocked IP address: 127.0.0.1');
    await expect(safeFetch('http://127.0.0.1:3000/api/admin')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks localhost', async () => {
    blockUrl('Blocked hostname: localhost');
    await expect(safeFetch('http://localhost/api/internal')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks 0.0.0.0', async () => {
    blockUrl('Blocked IP address: 0.0.0.0');
    await expect(safeFetch('http://0.0.0.0/')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── 4. file:// scheme ────────────────────────────────────────────────────────

describe('SSRF: dangerous scheme blocking', () => {
  it('blocks file:// scheme', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks ftp:// scheme', async () => {
    await expect(safeFetch('ftp://evil.com/payload')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks data: scheme', async () => {
    await expect(safeFetch('data:text/html,<script>alert(1)</script>')).rejects.toThrow(
      SsrfBlockedError
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks javascript: scheme', async () => {
    await expect(safeFetch('javascript:alert(1)')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks gopher: scheme', async () => {
    await expect(safeFetch('gopher://evil.com/_payload')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── 5. Redirect to metadata (the critical bypass) ───────────────────────────

describe('SSRF: redirect-chain validation', () => {
  it('blocks redirect from safe host to metadata IP', async () => {
    // Initial URL passes, redirect target is blocked
    allowThenBlock('Blocked IP address: 169.254.169.254');
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data/' }),
    });

    await expect(safeFetch('http://open-redirect.example.com/go')).rejects.toThrow(
      SsrfBlockedError
    );

    // fetch was called once (for the initial request), then blocked at redirect
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks redirect from safe host to localhost', async () => {
    allowThenBlock('Blocked hostname: localhost');
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://localhost:3000/admin' }),
    });

    await expect(safeFetch('http://legit-site.com/redirect')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks redirect to file:// scheme', async () => {
    // Initial URL is valid, but the redirect target has file:// scheme
    // The scheme check happens before validateUrl, so we only need allowUrl once
    allowUrl();
    mockFetch.mockResolvedValueOnce({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'file:///etc/shadow' }),
    });

    await expect(safeFetch('http://legit-site.com/redirect')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('follows valid redirects (public → public)', async () => {
    allowUrl(); // Both URLs pass
    mockFetch
      .mockResolvedValueOnce({
        status: 302,
        ok: false,
        headers: new Headers({ location: 'https://www.example.com/final' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
      });

    const res = await safeFetch('http://example.com/');
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('enforces max redirect limit', async () => {
    allowUrl(); // All URLs pass validation
    // Always returns a redirect
    mockFetch.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Headers({ location: 'http://example.com/loop' }),
    });

    await expect(safeFetch('http://example.com/start')).rejects.toThrow(/maximum redirect limit/i);
  });
});

// ─── 6. validateForBrowserNavigation (page.goto protection) ──────────────────

describe('SSRF: validateForBrowserNavigation', () => {
  it('blocks metadata IP for page.goto', async () => {
    blockUrl('Blocked IP address: 169.254.169.254');
    await expect(
      validateForBrowserNavigation('http://169.254.169.254/latest/meta-data/')
    ).rejects.toThrow(SsrfBlockedError);
  });

  it('blocks private IP for page.goto', async () => {
    blockUrl('Blocked IP address: 192.168.1.1');
    await expect(validateForBrowserNavigation('http://192.168.1.1/')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('blocks localhost for page.goto', async () => {
    blockUrl('Blocked hostname: localhost');
    await expect(validateForBrowserNavigation('http://localhost:9000/')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('blocks file:// for page.goto', async () => {
    // file:// is caught by scheme check before validateUrl is called
    await expect(validateForBrowserNavigation('file:///etc/passwd')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('allows valid public URL for page.goto', async () => {
    allowUrl();
    await expect(validateForBrowserNavigation('https://example.com/')).resolves.toBeUndefined();
  });
});

// ─── 7. safeFetchResponseDerived host allowlist ──────────────────────────────

describe('SSRF: safeFetchResponseDerived', () => {
  it('allows googleapis.com host', async () => {
    allowUrl();
    const res = await safeFetchResponseDerived(
      'https://places.googleapis.com/v1/places/abc123/media?key=xyz'
    );
    expect(res.status).toBe(200);
  });

  it('allows googleusercontent.com host', async () => {
    allowUrl();
    const res = await safeFetchResponseDerived('https://lh3.googleusercontent.com/photo/abc123');
    expect(res.status).toBe(200);
  });

  it('rejects non-allowlisted host', async () => {
    await expect(safeFetchResponseDerived('https://evil.com/steal-data')).rejects.toThrow(
      SsrfBlockedError
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects file:// scheme even with allowed-looking path', async () => {
    await expect(safeFetchResponseDerived('file:///etc/passwd')).rejects.toThrow(SsrfBlockedError);
  });
});

// ─── 8. General safeFetch behavior ───────────────────────────────────────────

describe('SSRF: safeFetch general', () => {
  it('passes through valid public HTTPS URL', async () => {
    allowUrl();
    const res = await safeFetch('https://example.com/page');
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Verify redirect: 'manual' is set
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('passes through valid public HTTP URL (allowHttp default true)', async () => {
    allowUrl();
    const res = await safeFetch('http://example.com/page');
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('blocks dangerous ports (Redis 6379)', async () => {
    blockUrl('Port 6379 is blocked for security reasons');
    await expect(safeFetch('http://example.com:6379/')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('blocks URLs with embedded credentials', async () => {
    blockUrl('URLs with embedded credentials are not allowed');
    await expect(safeFetch('http://admin:password@example.com/')).rejects.toThrow(SsrfBlockedError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
