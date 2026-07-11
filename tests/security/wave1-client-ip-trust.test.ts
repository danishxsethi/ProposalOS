/**
 * P2-22 regression tests: trusted-proxy-aware client IP extraction.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { getClientIp } from '@/lib/security/getClientIp';

function req(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/x', { headers });
}

describe('P2-22: getClientIp', () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOP_COUNT;
  });

  it('trusts only the last hop by default (1 trusted proxy)', () => {
    // Attacker sends a spoofed first entry; the last entry is the one our edge appended.
    const ip = getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9' }));
    expect(ip).toBe('9.9.9.9');
  });

  it('a caller cannot reset the rate-limit key by adding fake forwarded-for entries', () => {
    const attempt1 = getClientIp(req({ 'x-forwarded-for': 'attacker-fake-1, 9.9.9.9' }));
    const attempt2 = getClientIp(req({ 'x-forwarded-for': 'attacker-fake-2, 9.9.9.9' }));
    // Both resolve to the same real (trusted) IP regardless of the spoofed prefix.
    expect(attempt1).toBe('9.9.9.9');
    expect(attempt2).toBe('9.9.9.9');
  });

  it('handles multi-hop chains with a configured trusted-proxy count', () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = '2';
    // client, cdn-hop, our-edge-hop -> with 2 trusted hops, the real client is 2nd-from-right.
    const ip = getClientIp(req({ 'x-forwarded-for': '203.0.113.5, 198.51.100.9, 10.0.0.1' }));
    expect(ip).toBe('198.51.100.9');
  });

  it('fails safe to "unknown" on a malformed forwarded-for value', () => {
    const ip = getClientIp(req({ 'x-forwarded-for': 'not-an-ip' }));
    expect(ip).toBe('unknown');
  });

  it('fails safe to "unknown" when the chain is shorter than the trusted hop count', () => {
    process.env.TRUSTED_PROXY_HOP_COUNT = '3';
    const ip = getClientIp(req({ 'x-forwarded-for': '9.9.9.9' }));
    expect(ip).toBe('unknown');
  });

  it('falls back to x-real-ip only when x-forwarded-for is absent', () => {
    const ip = getClientIp(req({ 'x-real-ip': '203.0.113.9' }));
    expect(ip).toBe('203.0.113.9');
  });

  it('returns unknown when no IP headers are present', () => {
    const ip = getClientIp(req({}));
    expect(ip).toBe('unknown');
  });

  it('accepts a plausible IPv6 address', () => {
    const ip = getClientIp(req({ 'x-forwarded-for': '2001:db8::1' }));
    expect(ip).toBe('2001:db8::1');
  });
});
