import { describe, it, expect, vi } from 'vitest';
import { POST } from '../audit/[id]/propose/route';
import { prisma } from '@/lib/prisma';

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        audit: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        proposal: {
            create: vi.fn(),
            findFirst: vi.fn()
        },
        proposalTemplate: {
            findFirst: vi.fn()
        }
    }
}));

// Mock Auth Middleware to bypass
vi.mock('@/lib/middleware/auth', () => ({
    withAuth: (handler: any) => handler
}));

describe('Audit Proposal API Integration', () => {
    it('should return 404 if audit not found', async () => {
        (prisma.audit.findUnique as any).mockResolvedValue(null);

        const req = new Request('http://localhost/api/audit/123/propose', {
            method: 'POST',
            body: JSON.stringify({})
        });
        const params = { params: { id: '123' } };

        const res = await POST(req, params);
        expect(res.status).toBe(404);
    });

    // More integration tests would go here mocking the finding data
});
