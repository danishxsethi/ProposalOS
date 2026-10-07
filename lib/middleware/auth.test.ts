import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockValidateApiKey = vi.fn();
const mockRunWithTenantAsync = vi.fn();
const mockLoggerInfo = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock('@/lib/auth/apiKeys', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: (...args: unknown[]) => mockRunWithTenantAsync(...args),
}));

import { withAuth } from './auth';

describe('withAuth env API key tenant guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_KEY = 'test-env-api-key';
    process.env.DEFAULT_TENANT_ID = '00000000-0000-4000-8000-000000000001';
    mockRunWithTenantAsync.mockImplementation(async (_tenantId: unknown, fn: () => unknown) => fn());
  });

  it('uses only server-configured DEFAULT_TENANT_ID and ignores a forged tenant header', async () => {
    const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const wrapped = withAuth(handler);

    const req = new Request('http://localhost/api/protected', {
      headers: {
        Authorization: 'Bearer test-env-api-key',
        'x-tenant-id': '00000000-0000-4000-8000-000000000099',
      },
    });

    const res = await wrapped(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockRunWithTenantAsync).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      expect.any(Function)
    );
  });
});
