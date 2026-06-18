// @vitest-environment node
/**
 * tests/security/register-bypass-isolation.test.ts
 *
 * Security regression tests for the two runWithTenantBypass calls in
 * POST /api/auth/register.
 *
 * The register route is unauthenticated — no tenant context exists yet — so
 * two narrow bypasses are required:
 *
 *   1. auth-register-email-uniqueness-check
 *      Calls prisma.user.findUnique({ where: { email } }).
 *      The handler checks ONLY truthy/falsy.  No fields from the returned
 *      user object must appear in any response or be accessible to the
 *      caller — even if the matched user belongs to a different tenant.
 *
 *   2. auth-register-create-tenant-and-user
 *      Runs prisma.$transaction to create a brand-new Tenant and User.
 *      The bypass is write-only: no existing tenant data is read, and the
 *      response contains only the newly created user's own fields.
 *
 * Guarantees verified:
 *   A. Cross-tenant email collision → 400, zero cross-tenant data in body.
 *   B. Email uniqueness bypass exposes no field other than existence.
 *   C. Successful registration → response contains ONLY id/name/email of
 *      the new user — no tenant fields, no other users' data.
 *   D. The creation bypass does NOT read any existing Tenant rows.
 *   E. runWithTenantBypass is called with the exact expected reason strings
 *      so audit-trail labelling can be verified.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  runWithTenantBypass: vi.fn(),
  userFindUnique: vi.fn(),
  tenantCreate: vi.fn(),
  userCreate: vi.fn(),
  transaction: vi.fn(),
  withRateLimit: vi.fn(),
  bcryptHash: vi.fn(),
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: mocks.runWithTenantBypass,
  // other exports not needed for this route
  runWithTenantAsync: vi.fn(),
  getTenantId: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    tenant: { create: mocks.tenantCreate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/middleware/rateLimit', () => ({
  withRateLimit: mocks.withRateLimit,
}));

vi.mock('bcryptjs', () => ({
  default: { hash: mocks.bcryptHash },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

// Dynamic import ensures mocks are registered before the module loads
const importRoute = () => import('@/app/api/auth/register/route').then((m) => m.POST);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: 'Alice',
  email: 'alice@newco.com',
  password: 'secret123',
  companyName: 'NewCo',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Rate limit passthrough: withRateLimit(opts)(req, handler) calls handler()
  mocks.withRateLimit.mockImplementation(
    () => (_req: Request, handler: () => Promise<Response>) => handler()
  );

  // bypassFn passthrough — calls the supplied fn
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );

  mocks.bcryptHash.mockResolvedValue('$2b$10$hashedpassword');
});

afterEach(() => {
  vi.resetModules();
});

// ─── A. Cross-tenant email collision ─────────────────────────────────────────

describe('email uniqueness bypass — cross-tenant collision', () => {
  it('returns 400 when email is taken, with no cross-tenant data in body', async () => {
    // Simulate a user record belonging to a DIFFERENT tenant
    const otherTenantUser = {
      id: 'other-user-id',
      email: VALID_BODY.email,
      name: 'Other User',
      passwordHash: '$2b$10$otherhash',
      role: 'owner',
      tenantId: 'other-tenant-id',
      createdAt: new Date('2020-01-01'),
    };

    mocks.userFindUnique.mockResolvedValue(otherTenantUser);

    const POST = await importRoute();
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: 'User already exists' });

    // No fields from the other-tenant user must appear in the response
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('other-user-id');
    expect(bodyStr).not.toContain('other-tenant-id');
    expect(bodyStr).not.toContain('otherhash');
    expect(bodyStr).not.toContain('Other User');
  });
});

// ─── B. Email bypass is existence-only ───────────────────────────────────────

describe('email uniqueness bypass — data exposure', () => {
  it('calls findUnique with only { email } in the where clause', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    // Prevent registration from completing (no transaction needed for this assertion)
    mocks.runWithTenantBypass.mockImplementation(
      async (reason: string, fn: () => Promise<unknown>) => {
        if (reason === 'auth-register-email-uniqueness-check') return fn();
        // Abort before the creation bypass runs
        throw new Error('STOP_AFTER_CHECK');
      }
    );

    const POST = await importRoute();
    try {
      await POST(makeRequest(VALID_BODY));
    } catch {
      // expected abort
    }

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { email: VALID_BODY.email },
    });
    // Only email is used in the query — no cross-tenant scoping possible
    const callArg = mocks.userFindUnique.mock.calls[0][0] as { where: unknown };
    expect(Object.keys(callArg.where as object)).toEqual(['email']);
  });

  it('uses the exact bypass reason string for audit trail labelling', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.runWithTenantBypass.mockImplementation(
      async (reason: string, fn: () => Promise<unknown>) => {
        if (reason === 'auth-register-email-uniqueness-check') return fn();
        throw new Error('STOP');
      }
    );

    const POST = await importRoute();
    try {
      await POST(makeRequest(VALID_BODY));
    } catch {
      // expected abort
    }

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'auth-register-email-uniqueness-check',
      expect.any(Function)
    );
  });
});

// ─── C. Successful registration response contains only new user's own data ───

describe('creation bypass — response isolation', () => {
  it('response contains only id/name/email of the newly created user', async () => {
    const newTenantId = 'new-tenant-abc';
    const newUserId = 'new-user-xyz';

    mocks.userFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        tenant: {
          create: vi.fn().mockResolvedValue({
            id: newTenantId,
            name: VALID_BODY.companyName,
            planTier: 'free',
            status: 'pending',
          }),
        },
        user: {
          create: vi.fn().mockResolvedValue({
            id: newUserId,
            name: VALID_BODY.name,
            email: VALID_BODY.email,
            role: 'owner',
            tenantId: newTenantId,
            passwordHash: '$2b$10$hashedpassword',
            createdAt: new Date(),
          }),
        },
      };
      return fn(fakeTx);
    });

    const POST = await importRoute();
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);

    // Response shape: only user.id, user.name, user.email
    expect(body).toEqual({
      user: {
        id: newUserId,
        name: VALID_BODY.name,
        email: VALID_BODY.email,
      },
    });

    // No password hash in response
    expect(JSON.stringify(body)).not.toContain('hash');
    // No tenantId in response
    expect(JSON.stringify(body)).not.toContain(newTenantId);
    // No role in response
    expect(JSON.stringify(body)).not.toContain('owner');
  });
});

// ─── D. Creation bypass does not read existing Tenant rows ───────────────────

describe('creation bypass — no cross-tenant reads', () => {
  it('does not call tenant.findUnique or tenant.findMany during registration', async () => {
    const tenantFindUnique = vi.fn();
    const tenantFindMany = vi.fn();

    mocks.userFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        tenant: {
          create: vi.fn().mockResolvedValue({ id: 't1', name: 'X' }),
          findUnique: tenantFindUnique,
          findMany: tenantFindMany,
        },
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'u1',
            name: VALID_BODY.name,
            email: VALID_BODY.email,
            passwordHash: 'hash',
          }),
        },
      };
      return fn(fakeTx);
    });

    const POST = await importRoute();
    await POST(makeRequest(VALID_BODY));

    // Registration must not read any Tenant row
    expect(tenantFindUnique).not.toHaveBeenCalled();
    expect(tenantFindMany).not.toHaveBeenCalled();
  });
});

// ─── E. Bypass reason strings are stable (audit trail) ───────────────────────

describe('creation bypass — reason string for audit trail', () => {
  it('uses the exact reason string for the creation bypass', async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        tenant: { create: vi.fn().mockResolvedValue({ id: 't1' }) },
        user: { create: vi.fn().mockResolvedValue({ id: 'u1', name: 'X', email: 'x@x.com' }) },
      };
      return fn(fakeTx);
    });

    const POST = await importRoute();
    await POST(makeRequest(VALID_BODY));

    const bypassReasons = mocks.runWithTenantBypass.mock.calls.map(
      (c: unknown[]) => c[0]
    ) as string[];
    expect(bypassReasons).toContain('auth-register-email-uniqueness-check');
    expect(bypassReasons).toContain('auth-register-create-tenant-and-user');

    // No other bypass reasons (tightly scoped — exactly these two)
    expect(bypassReasons).toHaveLength(2);
  });
});
