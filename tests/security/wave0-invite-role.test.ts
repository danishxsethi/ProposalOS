// @vitest-environment node
/**
 * Wave 0 — P0-21 team invite role mass-assignment / super_admin escalation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invitationCreate: vi.fn(),
  invitationFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  invitationUpdate: vi.fn(),
  checkSeatLimit: vi.fn(),
  getTenantId: vi.fn(),
  runWithTenantAsync: vi.fn(),
  runWithTenantBypass: vi.fn(),
  validateApiKey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/billing/limits', () => ({ checkSeatLimit: mocks.checkSeatLimit }));
vi.mock('@/lib/tenant/context', () => ({
  getTenantId: mocks.getTenantId,
  runWithTenantAsync: mocks.runWithTenantAsync,
  runWithTenantBypass: mocks.runWithTenantBypass,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    invitation: {
      create: mocks.invitationCreate,
      findUnique: mocks.invitationFindUnique,
      update: mocks.invitationUpdate,
    },
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: mocks.userCreate },
        invitation: { update: mocks.invitationUpdate },
      })
    ),
  },
}));
vi.mock('@/lib/auth/apiKeys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/apiKeys')>();
  return { ...actual, validateApiKey: mocks.validateApiKey };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed') },
}));

import {
  assertAssignableInviteRole,
  apiKeySatisfiesRole,
  INVITE_ASSIGNABLE_ROLES,
} from '@/lib/auth/rbac';
import { POST as invitePost } from '@/app/api/team/invite/route';
import { POST as acceptPost } from '@/app/api/team/invite/[token]/accept/route';

describe('P0-21: invite role validation helpers', () => {
  it('never allows super_admin via invite', () => {
    expect(assertAssignableInviteRole('super_admin', 'agency_admin')).toEqual({
      error: 'Role is not assignable via invitation',
    });
    expect(assertAssignableInviteRole('super_admin', 'super_admin')).toEqual({
      error: 'Role is not assignable via invitation',
    });
    expect(INVITE_ASSIGNABLE_ROLES).not.toContain('super_admin');
  });

  it('caps role at inviter authority', () => {
    expect(assertAssignableInviteRole('agency_admin', 'agency_member')).toEqual({
      error: 'Cannot assign a role above your own authority',
    });
    expect(assertAssignableInviteRole('agency_member', 'agency_admin')).toEqual({
      role: 'agency_member',
    });
  });

  it('rejects unknown/legacy raw strings that are not valid roles', () => {
    expect(assertAssignableInviteRole('root', 'agency_admin')).toEqual({
      error: 'Invalid or unknown role',
    });
    // legacy owner normalizes to super_admin → still not assignable
    expect(assertAssignableInviteRole('owner', 'agency_admin')).toEqual({
      error: 'Role is not assignable via invitation',
    });
  });
});

describe('P0-21: invite API + accept revalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkSeatLimit.mockResolvedValue({ allowed: true });
    mocks.getTenantId.mockResolvedValue('11111111-1111-4111-8111-111111111111');
    mocks.runWithTenantAsync.mockImplementation((_t: string, fn: () => unknown) => fn());
    mocks.runWithTenantBypass.mockImplementation((_r: string, fn: () => unknown) => fn());
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'admin@example.com',
        role: 'agency_admin',
        tenantId: '11111111-1111-4111-8111-111111111111',
      },
    });
  });

  it('rejects super_admin role on invite create', async () => {
    const res = await invitePost(
      new Request('http://localhost/api/team/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'x@y.com', role: 'super_admin' }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not assignable|role/i);
    expect(mocks.invitationCreate).not.toHaveBeenCalled();
  });

  it('stores only validated role on successful invite', async () => {
    mocks.invitationCreate.mockResolvedValue({
      id: 'inv1',
      email: 'x@y.com',
      role: 'agency_member',
      token: 'tok',
    });

    const res = await invitePost(
      new Request('http://localhost/api/team/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'x@y.com', role: 'agency_member' }),
      })
    );
    expect(res.status).toBe(200);
    expect(mocks.invitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'agency_member' }),
      })
    );
  });

  it('accept path fails closed on stored super_admin role', async () => {
    mocks.invitationFindUnique.mockResolvedValue({
      id: 'inv1',
      email: 'x@y.com',
      role: 'super_admin',
      token: 'tok',
      tenantId: '11111111-1111-4111-8111-111111111111',
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
    });

    const res = await acceptPost(
      new Request('http://localhost/api/team/invite/tok/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Evil', password: 'password-long-enough' }),
      }),
      { params: Promise.resolve({ token: 'tok' }) }
    );

    expect(res.status).toBe(400);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('API-key-to-invite-to-super-admin chain is closed', () => {
    // Step 1: routine key cannot satisfy withRole(agency_admin) without admin scopes
    expect(apiKeySatisfiesRole(['audit:create'], 'agency_admin')).toBe(false);
    // Step 2: even agency_admin cannot assign super_admin
    expect(assertAssignableInviteRole('super_admin', 'agency_admin')).toHaveProperty('error');
    // Step 3: accept would fail closed even if a bad row existed
    expect(INVITE_ASSIGNABLE_ROLES.includes('super_admin' as never)).toBe(false);
  });
});
