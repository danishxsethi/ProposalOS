// @vitest-environment node
import { randomUUID } from 'crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  inspect: vi.fn(),
  revoke: vi.fn(),
  role: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/proposal/shareTokenRevocation', () => ({
  inspectProposalShareTokens: mocks.inspect,
  ProposalShareRevocationConflict: class ProposalShareRevocationConflict extends Error {},
  revokeProposalShareTokens: mocks.revoke,
}));
vi.mock('@/lib/middleware/withRole', () => ({
  withRole: (role: string, handler: (req: Request) => unknown) => {
    mocks.role(role);
    return handler;
  },
}));
vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: () => (_req: Request, next: () => unknown) => next(),
}));

import { POST } from '@/app/api/admin/proposal-share-revocations/route';

const configuredRole = mocks.role.mock.calls[0]?.[0];

const token = randomUUID();
const excessiveTokens = [token, randomUUID(), randomUUID(), randomUUID()];
const expectedTargets = [
  {
    tokenFingerprint: 'a'.repeat(64),
    proposalId: 'proposal-1',
    tenantId: 'tenant-1',
    auditId: 'audit-1',
  },
];

describe('proposal share-token revocation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'operator-1' } });
    mocks.inspect.mockResolvedValue([
      { tokenFingerprint: 'a'.repeat(64), disposition: 'NOT_REVOKED' },
    ]);
    mocks.revoke.mockResolvedValue([{ tokenFingerprint: 'a'.repeat(64), disposition: 'REVOKED' }]);
  });

  it('is restricted to super_admin and defaults to a no-store dry run', async () => {
    const response = await POST(
      new Request('https://local.test/api/admin/proposal-share-revocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokens: [token] }),
      })
    );

    expect(configuredRole).toBe('super_admin');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.inspect).toHaveBeenCalledWith([token]);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(token);
  });

  it('requires confirmation and the exact dry-run snapshot to apply', async () => {
    const response = await POST(
      new Request('https://local.test/api/admin/proposal-share-revocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokens: [token],
          dryRun: false,
          expectedTargets,
          confirmation: 'REVOKE_PUBLIC_PROPOSAL_LINKS',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith({
      tokens: [token],
      expectedTargets,
      actorId: 'operator-1',
    });
    expect(await response.text()).not.toContain(token);
  });

  it('rejects an apply request without the explicit confirmation', async () => {
    const response = await POST(
      new Request('https://local.test/api/admin/proposal-share-revocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokens: [token], dryRun: false, expectedTargets }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it('fails closed if the authenticated session has no operator id', async () => {
    mocks.auth.mockResolvedValue({ user: { role: 'super_admin' } });
    const response = await POST(
      new Request('https://local.test/api/admin/proposal-share-revocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokens: [token],
          dryRun: false,
          expectedTargets,
          confirmation: 'REVOKE_PUBLIC_PROPOSAL_LINKS',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it('rejects duplicate targets', async () => {
    const response = await POST(
      new Request('https://local.test/api/admin/proposal-share-revocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokens: [token, token] }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it('rejects more than three targets', async () => {
    const response = await POST(
      new Request('https://local.test/api/admin/proposal-share-revocations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokens: excessiveTokens,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });
});
