/**
 * P1-15 regression tests: the NextAuth credentials login path must be rate limited
 * before password verification, without affecting OAuth callbacks, and without
 * revealing whether an account exists.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCheckRateLimit, mockNextAuthPost } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockNextAuthPost: vi.fn(async () => new Response('ok', { status: 200 })),
}));

vi.mock('@/lib/auth', () => ({
  handlers: { GET: vi.fn(), POST: mockNextAuthPost },
}));
vi.mock('@/lib/middleware/rateLimit', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

import { POST } from '@/app/api/auth/[...nextauth]/route';

function credentialsRequest(email?: string): Request {
  return new Request('https://example.com/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'whatever' }),
  });
}

function oauthRequest(): Request {
  return new Request('https://example.com/api/auth/callback/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

describe('P1-15: credentials login rate limiting', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockReset();
    mockNextAuthPost.mockClear();
  });

  it('does not rate-limit OAuth callback paths', async () => {
    mockNextAuthPost.mockClear();
    await POST(oauthRequest() as any);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockNextAuthPost).toHaveBeenCalledTimes(1);
  });

  it('allows the request through when under the limit', async () => {
    mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() });
    mockNextAuthPost.mockClear();

    const res = await POST(credentialsRequest('user@example.com') as any);

    expect(res.status).toBe(200);
    expect(mockNextAuthPost).toHaveBeenCalledTimes(1);
  });

  it('blocks with 429 when the IP limit is exceeded, without reaching NextAuth', async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfter: 900,
    });
    mockNextAuthPost.mockClear();

    const res = await POST(credentialsRequest('user@example.com') as any);

    expect(res.status).toBe(429);
    expect(mockNextAuthPost).not.toHaveBeenCalled();
    expect(res.headers.get('Retry-After')).toBe('900');
  });

  it('checks both an IP-keyed and an account-keyed limit for a request with an email', async () => {
    mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() });

    await POST(credentialsRequest('user@example.com') as any);

    expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
    const secondCallOptions = mockCheckRateLimit.mock.calls[1][1];
    expect(secondCallOptions.sessionId).toBe('login:user@example.com');
  });

  it('does not throw or leak account existence when email is absent from the body', async () => {
    mockCheckRateLimit.mockResolvedValue({ success: true, remaining: 9, resetAt: new Date() });

    const res = await POST(credentialsRequest(undefined) as any);

    expect(res.status).toBe(200);
    // Only the IP-keyed check runs; no account-keyed check without an email.
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });

  it('returns an identical generic 429 body regardless of whether the account exists', async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      remaining: 0,
      resetAt: new Date(),
      retryAfter: 60,
    });

    const resReal = await POST(credentialsRequest('real@example.com') as any);
    const resFake = await POST(credentialsRequest('doesnotexist@example.com') as any);

    const bodyReal = await resReal.json();
    const bodyFake = await resFake.json();
    expect(bodyReal).toEqual(bodyFake);
  });
});
