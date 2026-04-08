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
    delete process.env.DEFAULT_TENANT_ID;
  });

  it('returns clean 400 when env API key is used without x-tenant-id and no DEFAULT_TENANT_ID', async () => {
    const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const wrapped = withAuth(handler);

    const req = new Request('http://localhost/api/protected', {
      headers: {
        Authorization: 'Bearer test-env-api-key',
      },
    });

    const res = await wrapped(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'Missing x-tenant-id header' });
    expect(handler).not.toHaveBeenCalled();
    expect(mockRunWithTenantAsync).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
