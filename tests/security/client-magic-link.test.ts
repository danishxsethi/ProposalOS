// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    audit: {
      findFirst: vi.fn(),
    },
    findingStatus: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import ClientAuditPage from '@/app/(client)/client/audit/[id]/page';

describe('client magic-link audit access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the audit when token matches the audit proposal', async () => {
    (prisma.audit.findFirst as any).mockResolvedValue({
      id: 'audit-1',
      findings: [
        {
          id: 'finding-1',
          type: 'PAINKILLER',
          title: 'Broken SSL',
          description: 'Certificate missing',
          recommendedFix: ['Install TLS'],
        },
      ],
    });
    (prisma.findingStatus.findMany as any).mockResolvedValue([
      { findingId: 'finding-1', status: 'fixed' },
    ]);

    const ui = await ClientAuditPage({
      params: { id: 'audit-1' },
      searchParams: { token: 'token-1' },
    });

    render(ui);

    expect(prisma.audit.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'audit-1',
        proposals: {
          some: {
            webLinkToken: 'token-1',
          },
        },
      },
      include: {
        findings: true,
      },
    });
    expect(screen.getByText('Live Fix Tracker')).toBeInTheDocument();
    expect(screen.getByText('Broken SSL')).toBeInTheDocument();
  });

  it('returns not found when token does not match the requested audit', async () => {
    (prisma.audit.findFirst as any).mockResolvedValue(null);

    await expect(
      ClientAuditPage({
        params: { id: 'audit-2' },
        searchParams: { token: 'token-1' },
      })
    ).rejects.toThrow('NOT_FOUND');

    expect(prisma.audit.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'audit-2',
        proposals: {
          some: {
            webLinkToken: 'token-1',
          },
        },
      },
      include: {
        findings: true,
      },
    });
  });

  it('redirects to login when token is missing', async () => {
    await expect(
      ClientAuditPage({
        params: { id: 'audit-1' },
        searchParams: {},
      })
    ).rejects.toThrow('REDIRECT:/login');

    expect(prisma.audit.findFirst).not.toHaveBeenCalled();
  });

  it('returns not found for malformed or unknown tokens', async () => {
    (prisma.audit.findFirst as any).mockResolvedValue(null);

    await expect(
      ClientAuditPage({
        params: { id: 'audit-1' },
        searchParams: { token: 'not-a-real-token' },
      })
    ).rejects.toThrow('NOT_FOUND');
  });
});
