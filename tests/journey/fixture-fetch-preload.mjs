/**
 * tests/journey/fixture-fetch-preload.cjs
 *
 * Preloaded via NODE_OPTIONS="--require <this file>" in the controlled
 * joined-journey Next server (and every child process it spawns, including the
 * dev-mode next-server worker) so the provider fixture interception is active
 * in EVERY process, regardless of Next.js instrumentation timing.
 *
 * What it does (strictly test-scoped):
 *   When PROPOSALOS_PROVIDER_FIXTURE_URL + PROPOSALOS_PROVIDER_FIXTURE_HOSTS
 *   are set and NODE_ENV is not 'production', outbound global fetch calls to
 *   the EXACT allowlisted provider hostnames are redirected to the local
 *   fixture provider server, preserving path and query. Everything else —
 *   including audit targets, which go through safeFetch's own SSRF validation —
 *   is untouched.
 *
 * This file is test harness code: it is never imported by the application and
 * has no effect unless both environment variables are explicitly set.
 */

(function installProviderFixtureFetchInterception() {
  const fixtureUrl = process.env.PROPOSALOS_PROVIDER_FIXTURE_URL;
  const hostsRaw = process.env.PROPOSALOS_PROVIDER_FIXTURE_HOSTS;
  if (!fixtureUrl || !hostsRaw) return;
  if (process.env.NODE_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[fixture-fetch-preload] Provider fixture interception configured but NODE_ENV=production — refusing'
    );
    return;
  }

  const hosts = new Set(
    hostsRaw
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  );
  if (hosts.size === 0) return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = function fixtureAwareFetch(input, init) {
    try {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const parsed = new URL(url);
      if (hosts.has(parsed.hostname.toLowerCase())) {
        const target = new URL(parsed.pathname + parsed.search, fixtureUrl).toString();
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        headers.set('x-fixture-original-host', parsed.hostname);
        console.info(
          `[fixture-fetch-preload] redirecting allowlisted provider call (${parsed.hostname}) to local fixture server`
        );
        return originalFetch(target, { ...init, headers });
      }
    } catch {
      // Malformed input falls through to the original fetch untouched.
    }
    return originalFetch(input, init);
  };

  // eslint-disable-next-line no-console
  console.warn(
    `[fixture-fetch-preload] TEST-SCOPED provider fixture interception active in pid ${process.pid} — provider calls to allowlisted hosts are served by local fixtures, not real APIs`
  );
})();
