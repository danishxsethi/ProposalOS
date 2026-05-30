// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    proposal: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    proposalTemplate: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/tenant/context', () => ({
  getTenantId: vi.fn().mockResolvedValue('tenant-test'),
}));

vi.mock('server-only', () => ({}));

// Mock Auth Middleware to bypass
vi.mock('@/lib/middleware/auth', () => ({
  withAuth: (handler: any) => handler,
}));

import { POST } from '@/app/api/audit/[id]/propose/route';

describe('Audit Proposal API Integration', () => {
  it('should return 404 if audit not found', async () => {
    (prisma.audit.findFirst as any).mockResolvedValue(null);

    const req = new Request('http://localhost/api/audit/123/propose', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const params = { params: Promise.resolve({ id: '123' }) };

    const res = await POST(req, params);
    expect(res.status).toBe(404);
  });

  // More integration tests would go here mocking the finding data
});
