// @vitest-environment node
/**
 * Wave 0 — P0-20 unauthenticated tenant delete-data containment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  recordAuditTrailEvent: vi.fn(),
  runWithTenantAsync: vi.fn(),
  tenantFindUnique: vi.fn(),
  verifyCronAuth: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/observability/auditTrail', () => ({
  recordAuditTrailEvent: mocks.recordAuditTrailEvent,
}));
vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: mocks.runWithTenantAsync,
}));
vi.mock('@/lib/middleware/cronAuth', () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    tenant: { findUnique: mocks.tenantFindUnique, update: vi.fn() },
    prospectLead: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    outreachEmail: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    outreachEmailEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    proposal: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    audit: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    contactRequest: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    followUpEmailSend: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    proposalOutreach: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    clientMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    findingStatus: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    reviewSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    evidenceSnapshot: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    apiKey: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    usageRecord: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    cartAbandonmentEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    failedWebhookEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    qATelemetry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    promptPerformanceLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditTrailEvent: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import {
  DELETE,
  DELETE_DATA_CONFIRMATION,
  GET,
} from '@/app/api/tenants/[tenantId]/delete-data/route';

const TENANT = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

describe('P0-20: tenant delete-data authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAuditTrailEvent.mockResolvedValue(undefined);
    mocks.runWithTenantAsync.mockImplementation((_t: string, fn: () => unknown) => fn());
    mocks.tenantFindUnique.mockResolvedValue({
      id: TENANT,
      name: 'Acme',
      status: 'active',
      users: [],
    });
    mocks.auth.mockResolvedValue(null);
    mocks.verifyCronAuth.mockResolvedValue(null);
    delete process.env.CRON_SECRET;
  });

  it('rejects anonymous DELETE', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );

    expect(res.status).toBe(401);
    expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
  });

  it('rejects anonymous GET', async () => {
    const res = await GET(new Request('http://localhost/api/tenants/' + TENANT + '/delete-data'), {
      params: Promise.resolve({ tenantId: TENANT }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects invalid tenant id format', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'a@b.com', role: 'super_admin', tenantId: TENANT, id: 'u1' },
    });
    const res = await DELETE(
      new Request('http://localhost/api/tenants/not-a-uuid/delete-data', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: DELETE_DATA_CONFIRMATION }),
      }),
      { params: Promise.resolve({ tenantId: 'not-a-uuid' }) }
    );
    expect(res.status).toBe(400);
  });

  it('rejects tenant admin of a different tenant', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'a@b.com', role: 'agency_admin', tenantId: OTHER, id: 'u1' },
    });
    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: DELETE_DATA_CONFIRMATION }),
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );
    expect(res.status).toBe(403);
  });

  it('requires explicit confirmation for session DELETE', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'a@b.com', role: 'agency_admin', tenantId: TENANT, id: 'u1' },
    });
    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: 'yes' }),
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );
    expect(res.status).toBe(400);
    expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
  });

  it('allows own-tenant agency_admin with confirmation', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'a@b.com', role: 'agency_admin', tenantId: TENANT, id: 'u1' },
    });
    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: DELETE_DATA_CONFIRMATION }),
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.recordAuditTrailEvent).toHaveBeenCalled();
  });

  it('allows super_admin for any tenant with confirmation', async () => {
    mocks.auth.mockResolvedValue({
      user: { email: 'root@b.com', role: 'super_admin', tenantId: OTHER, id: 'u0' },
    });
    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: DELETE_DATA_CONFIRMATION }),
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );
    expect(res.status).toBe(200);
  });

  it('allows cron bearer path without session', async () => {
    process.env.CRON_SECRET = 'test-cron-secret-value';
    mocks.verifyCronAuth.mockResolvedValue(null);

    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-cron-secret-value' },
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );
    expect(res.status).toBe(200);
    expect(mocks.verifyCronAuth).toHaveBeenCalled();
  });

  it('ignores self-asserted X-Cron-Auth without bearer secret', async () => {
    const res = await DELETE(
      new Request('http://localhost/api/tenants/' + TENANT + '/delete-data', {
        method: 'DELETE',
        headers: { 'X-Cron-Auth': 'true' },
      }),
      { params: Promise.resolve({ tenantId: TENANT }) }
    );
    expect(res.status).toBe(401);
  });
});
