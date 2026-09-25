// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTenantId: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  assertPublishable: vi.fn(),
  resolvePublicProposalAccess: vi.fn(),
}));

vi.mock('@/lib/tenant/context', () => ({ getTenantId: mocks.getTenantId }));
vi.mock('@/lib/prisma', () => ({ prisma: { proposal: { findFirst: mocks.findFirst, update: mocks.update } } }));
vi.mock('@/lib/middleware/auth', () => ({ withAuth: (handler: (...args: any[]) => unknown) => handler }));
vi.mock('@/lib/middleware/idempotency', () => ({ withIdempotency: (handler: (...args: any[]) => unknown) => handler }));
vi.mock('@/lib/middleware/rateLimit', () => ({ withRateLimit: () => (_req: Request, next: () => unknown) => next() }));
vi.mock('@/lib/observability/auditTrail', () => ({ recordAuditTrailEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/proposal/publication', () => ({
  assertProposalPublishable: mocks.assertPublishable,
  proposalPublicationFingerprint: vi.fn(() => 'status-authority-fingerprint'),
}));
vi.mock('@/lib/proposal/publicAccess', () => ({
  PublicProposalAccessError: class PublicProposalAccessError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  resolvePublicProposalAccess: mocks.resolvePublicProposalAccess,
}));

import { PATCH } from '@/app/api/proposal/token/[token]/status/route';

describe('public proposal token status boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertPublishable.mockImplementation(() => undefined);
    mocks.resolvePublicProposalAccess.mockResolvedValue({ proposalId: 'p1', tenantId: 'tenant-a' });
  });

  it.each(['ACCEPTED', 'REJECTED', 'CLOSED_WON', 'CLOSED_LOST', 'PAID', 'READY', 'SENT'])(
    'does not permit a bearer token to set %s', async (status) => {
      mocks.getTenantId.mockResolvedValue(null);
      const response = await PATCH(new Request('https://local.test/api/proposal/token/t/status', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      }), { params: Promise.resolve({ token: 'share-token' }) });
      expect(response.status).toBe(401);
      expect(mocks.findFirst).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it('only allows authenticated tenant operator view-state transitions', async () => {
    mocks.getTenantId.mockResolvedValue('tenant-a');
    mocks.resolvePublicProposalAccess.mockResolvedValue({ proposalId: 'p1', tenantId: 'tenant-a' });
    mocks.findFirst.mockResolvedValue({ id: 'p1', tenantId: 'tenant-a', auditId: 'a1', status: 'SENT', qaResults: {} });
    mocks.update.mockResolvedValue({ id: 'p1', status: 'VIEWED', viewedAt: new Date(), sentAt: new Date() });
    const response = await PATCH(new Request('https://local.test/api/proposal/token/t/status', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'VIEWED' }),
    }), { params: Promise.resolve({ token: 'share-token' }) });
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: { webLinkToken: 'share-token', tenantId: 'tenant-a' } });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', tenantId: 'tenant-a' } }));
  });
});
