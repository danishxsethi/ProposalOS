// @vitest-environment node
/**
 * Wave 0 — P0-24 security-module SSRF / redirect safety.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const mockValidateUrl = vi.fn();

vi.mock('@/lib/security/urlValidator', () => ({
  validateUrl: (...args: unknown[]) => mockValidateUrl(...args),
  default: (...args: unknown[]) => mockValidateUrl(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { fetchWithRedirect } from '@/lib/modules/security';

const realFetch = globalThis.fetch;
const mockFetch = vi.fn();

function allow() {
  mockValidateUrl.mockResolvedValue({ isValid: true });
}
function block(reason: string) {
  mockValidateUrl.mockResolvedValue({ isValid: false, error: reason });
}

describe('P0-24: security module fetchWithRedirect SSRF controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    allow();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('validates the initial URL before fetch', async () => {
    block('private IP blocked');
    await expect(fetchWithRedirect('http://127.0.0.1/')).rejects.toThrow(/SSRF blocked/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('revalidates redirect Location and blocks metadata hop', async () => {
    mockValidateUrl
      .mockResolvedValueOnce({ isValid: true })
      .mockResolvedValueOnce({ isValid: false, error: 'metadata endpoint blocked' });

    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data' }),
      body: { cancel: async () => undefined },
    });

    await expect(fetchWithRedirect('https://example.com/', true)).rejects.toThrow(
      /SSRF blocked|metadata/
    );
  });

  it('caps redirect hops', async () => {
    allow();
    mockFetch.mockImplementation(async () => ({
      status: 302,
      headers: new Headers({ location: 'https://example.com/next' }),
      body: { cancel: async () => undefined },
    }));

    await expect(fetchWithRedirect('https://example.com/', true)).rejects.toThrow(
      /maximum redirect/i
    );
  });

  it('returns headers without following when followRedirects=false', async () => {
    allow();
    mockFetch.mockResolvedValueOnce({
      status: 302,
      headers: new Headers({ location: 'https://evil.example/x', 'x-test': '1' }),
      body: { cancel: async () => undefined },
    });

    const result = await fetchWithRedirect('https://example.com/', false);
    expect(result.statusCode).toBe(302);
    expect(result.finalUrl).toBe('https://example.com/');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects credentialed URLs', async () => {
    allow();
    await expect(fetchWithRedirect('https://user:pass@example.com/', false)).rejects.toThrow(
      /credentialed/i
    );
  });
});

describe('P0-24: production path hygiene', () => {
  it('security.ts has no rejectUnauthorized:false', () => {
    const src = readFileSync(path.join(process.cwd(), 'lib/modules/security.ts'), 'utf8');
    // Code must not disable TLS verification (comments mentioning the ban are fine).
    expect(src).not.toMatch(/rejectUnauthorized\s*:\s*false/);
    expect(src).toMatch(/rejectUnauthorized\s*:\s*true/);
    expect(src).not.toMatch(/import \* as http from/);
    expect(src).not.toMatch(/import \* as https from/);
  });
});
