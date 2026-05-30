// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  auditFindUnique: vi.fn(),
  proposalFindMany: vi.fn(),
  generateCaseStudyPdf: vi.fn(),
  runWithTenantBypass: vi.fn(),
  runWithTenantAsync: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findUnique: mocks.auditFindUnique,
    },
    proposal: {
      findMany: mocks.proposalFindMany,
    },
  },
}));

vi.mock('@/lib/pdf/generateCaseStudyPdf', () => ({
  generateCaseStudyPdf: mocks.generateCaseStudyPdf,
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: mocks.runWithTenantBypass,
  runWithTenantAsync: mocks.runWithTenantAsync,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: mocks.loggerInfo,
  },
}));

import { GET } from '@/app/api/case-study/[auditId]/generate/route';

function setupPassthroughTenantHelpers() {
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );
  mocks.runWithTenantAsync.mockImplementation(
    async (_tenantId: string, fn: () => Promise<unknown>) => fn()
  );
}

describe('case-study token authorization (Hardening Target #6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPassthroughTenantHelpers();
    mocks.getServerSession.mockResolvedValue(null);
  });

  it('1. Missing token rejects with 401 Unauthorized when unauthenticated', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1' });

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Authentication required');
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('2. Invalid token rejects with 403 Forbidden', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1' });
    mocks.proposalFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate?token=invalid-token'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('INVALID_TOKEN');
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('3. Expired token (by status REJECTED) rejects with 403 Forbidden', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1' });
    mocks.proposalFindMany.mockResolvedValue([
      {
        id: 'proposal-1',
        tenantId: 'tenant-1',
        webLinkToken: 'expired-token',
        status: 'REJECTED',
        createdAt: new Date(),
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate?token=expired-token'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('EXPIRED_TOKEN');
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('4. Expired token (by age > 90 days) rejects with 403 Forbidden', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1' });
    // Created 91 days ago
    const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    mocks.proposalFindMany.mockResolvedValue([
      {
        id: 'proposal-1',
        tenantId: 'tenant-1',
        webLinkToken: 'expired-token',
        status: 'READY',
        createdAt: oldDate,
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate?token=expired-token'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe('Forbidden');
    expect(body.message).toBe('EXPIRED_TOKEN');
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('5. Token for Audit A cannot access Audit B', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-b', tenantId: 'tenant-1' });
    // Proposal is linked to audit-a, not audit-b
    mocks.proposalFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-b/generate?token=token-a'),
      { params: Promise.resolve({ auditId: 'audit-b' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('6. Token for Tenant A cannot access Tenant B (cross-tenant mismatch)', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-a', tenantId: 'tenant-a' });
    mocks.proposalFindMany.mockResolvedValue([
      {
        id: 'proposal-1',
        tenantId: 'tenant-b', // Proposal belongs to tenant-b
        webLinkToken: 'token-a',
        status: 'READY',
        createdAt: new Date(),
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-a/generate?token=token-a'),
      { params: Promise.resolve({ auditId: 'audit-a' }) }
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe('CROSS_TENANT_MISMATCH');
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('7. Valid token succeeds and triggers PDF generation under tenant context', async () => {
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-1',
      businessName: 'Acme Dental',
    });
    mocks.proposalFindMany.mockResolvedValue([
      {
        id: 'proposal-1',
        tenantId: 'tenant-1',
        webLinkToken: 'valid-token',
        status: 'READY',
        createdAt: new Date(),
      },
    ]);
    mocks.generateCaseStudyPdf.mockResolvedValue(Buffer.from('fake-pdf'));

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate?token=valid-token'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(mocks.generateCaseStudyPdf).toHaveBeenCalledWith(
      'audit-1',
      expect.any(String),
      'Acme Dental',
      'valid-token'
    );
  });

  it('8. Valid authenticated tenant user can generate PDF without a token', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { tenantId: 'tenant-1' },
    });
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-1',
      businessName: 'Acme Dental',
    });
    mocks.generateCaseStudyPdf.mockResolvedValue(Buffer.from('fake-pdf'));

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant-1', expect.any(Function));
    expect(mocks.generateCaseStudyPdf).toHaveBeenCalledWith(
      'audit-1',
      expect.any(String),
      'Acme Dental',
      undefined
    );
  });

  it('9. Wrong tenant user cannot generate PDF', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { tenantId: 'tenant-2' }, // logged in as tenant-2
    });
    mocks.auditFindUnique.mockResolvedValue({
      id: 'audit-1',
      tenantId: 'tenant-1', // owned by tenant-1
    });

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-1/generate'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });

  it('10. Error messages do not leak audit existence unnecessarily (NOT_FOUND returns 404)', async () => {
    mocks.auditFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/case-study/audit-unknown/generate?token=any-token'),
      { params: Promise.resolve({ auditId: 'audit-unknown' }) }
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('Audit not found');
  });

  it('11. Tokens are never logged', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1' });
    mocks.proposalFindMany.mockResolvedValue([]);

    const token = 'my-super-secret-token-12345';
    await GET(
      new Request(`http://localhost/api/case-study/audit-1/generate?token=${token}`),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    // Verify mocks don't log the raw token
    const errorCalls = mocks.loggerError.mock.calls;
    for (const call of errorCalls) {
      const logObj = call[0];
      const logStr = JSON.stringify(logObj);
      expect(logStr).not.toContain(token);
    }
  });

  it('12. PDF generation is not called before auth succeeds', async () => {
    mocks.auditFindUnique.mockResolvedValue({ id: 'audit-1', tenantId: 'tenant-1' });
    mocks.proposalFindMany.mockResolvedValue([]); // auth fails

    await GET(
      new Request('http://localhost/api/case-study/audit-1/generate?token=bad-token'),
      { params: Promise.resolve({ auditId: 'audit-1' }) }
    );

    expect(mocks.generateCaseStudyPdf).not.toHaveBeenCalled();
  });
});
