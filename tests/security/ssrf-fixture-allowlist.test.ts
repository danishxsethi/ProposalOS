// @vitest-environment node
/**
 * tests/security/ssrf-fixture-allowlist.test.ts
 *
 * Regression qualification for the test-scoped loopback fixture allowlist
 * (PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS) added for the controlled joined journey.
 *
 * The allowlist must:
 *   1. Be inert unless the env var lists the exact hostname.
 *   2. Accept a listed hostname only when it resolves to loopback.
 *   3. Never relax any other SSRF policy: blocked ports, metadata IPs, private
 *      non-loopback ranges, credential URLs, and redirect re-validation.
 *   4. Hard-refuse in production (NODE_ENV=production) even if configured.
 *   5. Fail closed for listed hosts that resolve to non-loopback addresses.
 */
import http from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server as mswServer } from '../../vitest.setup';
import { safeFetch, SsrfBlockedError } from '@/lib/security/safeFetch';
import { validateUrl } from '@/lib/security/urlValidator';

const ENV_KEY = 'PROPOSALOS_SSRF_TEST_FIXTURE_HOSTS';

let fixtureServer: http.Server | undefined;
let redirectServer: http.Server | undefined;
let fixturePort = 0;
let redirectPort = 0;

beforeAll(async () => {
  // These tests exercise the real safeFetch network path (local loopback
  // servers, manual redirect handling, pinned dispatchers). MSW's global
  // interceptor — installed repo-wide by vitest.setup.ts — does not pass
  // through safeFetch's manual-redirect + custom-dispatcher fetches
  // correctly, so disable it for this file and restore it afterwards.
  mswServer.close();
  await new Promise<void>((resolve) => {
    fixtureServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>fixture</body></html>');
    });
    fixtureServer.listen(0, '127.0.0.1', () => {
      fixturePort = (fixtureServer!.address() as { port: number }).port;
      resolve();
    });
  });
  await new Promise<void>((resolve) => {
    // 302 redirector: every request redirects to the cloud metadata endpoint.
    redirectServer = http.createServer((req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
    });
    redirectServer.listen(0, '127.0.0.1', () => {
      redirectPort = (redirectServer!.address() as { port: number }).port;
      resolve();
    });
  });
});

afterAll(async () => {
  await Promise.allSettled([
    new Promise<void>((resolve) => fixtureServer?.close(() => resolve())),
    new Promise<void>((resolve) => redirectServer?.close(() => resolve())),
  ]);
  // Restore MSW for subsequent test files (per-file setup re-listens anyway).
  mswServer.listen();
});

afterEach(() => {
  delete process.env[ENV_KEY];
  process.env.NODE_ENV = 'test';
});

describe('SSRF test fixture host allowlist', () => {
  it('blocks loopback hosts when the allowlist env is unset', async () => {
    delete process.env[ENV_KEY];
    const result = await validateUrl('http://localhost:8788', {
      allowHttp: true,
      requireHttps: false,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Blocked hostname');
  });

  it('accepts an exactly-listed loopback hostname outside production', async () => {
    process.env[ENV_KEY] = 'localhost';
    const result = await validateUrl(`http://localhost:${fixturePort}`, {
      allowHttp: true,
      requireHttps: false,
    });
    expect(result.isValid).toBe(true);
    expect(result.sanitizedUrl).toContain(`localhost:${fixturePort}`);
    expect(result.resolvedAddresses?.length).toBeGreaterThan(0);
    for (const address of result.resolvedAddresses!) {
      expect(address.address.startsWith('127.')).toBe(true);
    }
  });

  it('accepts an exactly-listed loopback IP literal (fixture S3/storage endpoints)', async () => {
    process.env[ENV_KEY] = 'localhost,127.0.0.1';
    const result = await validateUrl(`http://127.0.0.1:${fixturePort}/bucket/key`, {
      allowHttp: true,
      requireHttps: false,
    });
    expect(result.isValid).toBe(true);
    expect(result.resolvedAddresses?.[0]?.address).toBe('127.0.0.1');
  });

  it('still blocks non-listed private and metadata targets while the allowlist is active', async () => {
    process.env[ENV_KEY] = 'localhost';
    const metadata = await validateUrl('http://169.254.169.254/latest', {
      allowHttp: true,
      requireHttps: false,
    });
    expect(metadata.isValid).toBe(false);
    const privateIp = await validateUrl('http://10.0.0.5/', {
      allowHttp: true,
      requireHttps: false,
    });
    expect(privateIp.isValid).toBe(false);
    const internalName = await validateUrl('http://internal/admin', {
      allowHttp: true,
      requireHttps: false,
    });
    expect(internalName.isValid).toBe(false);
  });

  it('still blocks blocked ports on a listed fixture host', async () => {
    process.env[ENV_KEY] = 'localhost';
    const result = await validateUrl('http://localhost:5432', {
      allowHttp: true,
      requireHttps: false,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Port 5432 is blocked');
  });

  it('fails closed when a listed host is not a loopback address', async () => {
    // Listing a private non-loopback IP must not make it fetchable.
    process.env[ENV_KEY] = '10.0.0.5';
    const result = await validateUrl('http://10.0.0.5/', { allowHttp: true, requireHttps: false });
    expect(result.isValid).toBe(false);
  });

  it('hard-refuses the allowlist in production even when configured', async () => {
    process.env[ENV_KEY] = 'localhost';
    process.env.NODE_ENV = 'production';
    const result = await validateUrl('http://localhost:8788', {
      allowHttp: true,
      requireHttps: false,
    });
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Blocked hostname');
  });

  it('safeFetch reaches a listed loopback fixture server', async () => {
    process.env[ENV_KEY] = 'localhost';
    const response = await safeFetch(`http://localhost:${fixturePort}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('fixture');
  });

  it('safeFetch still blocks a fixture redirect to the cloud metadata endpoint', async () => {
    process.env[ENV_KEY] = 'localhost';
    await expect(safeFetch(`http://localhost:${redirectPort}/`)).rejects.toThrow(SsrfBlockedError);
  });

  it('safeFetch blocks loopback fetches when the allowlist is unset', async () => {
    delete process.env[ENV_KEY];
    await expect(safeFetch(`http://localhost:${fixturePort}/`)).rejects.toThrow(SsrfBlockedError);
  });
});
