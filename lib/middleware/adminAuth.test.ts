import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimitMock, loggerErrorMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/lib/middleware/rateLimit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/logger', () => ({ logger: { error: loggerErrorMock } }));

import { verifyAdminOrCronAuth } from './adminAuth';

describe('verifyAdminOrCronAuth', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_API_KEY', 'admin-test-key');
    vi.stubEnv('CRON_SECRET', 'cron-test-secret');
    checkRateLimitMock.mockReset().mockResolvedValue({ success: true });
    loggerErrorMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['admin-test-key', 'cron-test-secret'])('accepts a configured bearer credential', async (secret) => {
    const request = new Request('https://example.test/api/admin/telemetry', {
      headers: { authorization: `Bearer ${secret}` },
    });

    await expect(verifyAdminOrCronAuth(request)).resolves.toBeNull();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it('fails closed when neither credential is configured', async () => {
    vi.stubEnv('ADMIN_API_KEY', '');
    vi.stubEnv('CRON_SECRET', '');

    const response = await verifyAdminOrCronAuth(new Request('https://example.test'));

    expect(response?.status).toBe(401);
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledOnce();
  });

  it('rate-limits invalid credentials and returns 429 when the limiter blocks', async () => {
    checkRateLimitMock.mockResolvedValue({ success: false, retryAfter: 30 });

    const response = await verifyAdminOrCronAuth(
      new Request('https://example.test', { headers: { authorization: 'Bearer wrong' } })
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('30');
    expect(checkRateLimitMock).toHaveBeenCalledOnce();
  });
});
