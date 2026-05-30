// @vitest-environment node
/**
 * tests/security/auth-adapter-context.test.ts
 *
 * Task #14: Auth-table RLS strategy — security regression tests.
 *
 * Covers:
 *   1. runWithAuthAdapterContext accepts allow-listed models
 *   2. runWithAuthAdapterContext rejects business models (Audit, Proposal, …)
 *   3. runWithAuthAdapterContext rejects unknown / typo'd models
 *   4. Empty model list is rejected
 *   5. Operation name is propagated to the bypass reason for audit trail
 *   6. Bypass reason logged with structured event
 *   7. Wrapped adapter routes every method through the helper
 *   8. Wrapped adapter passes unknown methods through unchanged (no widened bypass)
 *   9. AuthAdapterModelNotAllowedError carries the attempted model
 *  10. isAuthAdapterModel type guard
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  runWithTenantBypass: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: mocks.runWithTenantBypass,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import {
  AUTH_ADAPTER_ALLOWED_MODELS,
  AuthAdapterModelNotAllowedError,
  isAuthAdapterModel,
  runWithAuthAdapterContext,
} from '@/lib/auth/adapterContext';

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: passthrough — runWithTenantBypass calls the supplied fn directly
  mocks.runWithTenantBypass.mockImplementation(
    async (_reason: string, fn: () => Promise<unknown>) => fn()
  );
});

// ─── runWithAuthAdapterContext ────────────────────────────────────────────────

describe('runWithAuthAdapterContext', () => {
  it('allows User model and runs fn under bypass', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 'u-1' });

    const result = await runWithAuthAdapterContext(
      { operation: 'getUserByEmail', models: ['User'] },
      fn
    );

    expect(result).toEqual({ id: 'u-1' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'auth-adapter:getUserByEmail',
      expect.any(Function)
    );
  });

  it('allows Account', async () => {
    const fn = vi.fn().mockResolvedValue(null);
    await runWithAuthAdapterContext({ operation: 'getUserByAccount', models: ['Account'] }, fn);
    expect(fn).toHaveBeenCalled();
  });

  it('allows Session', async () => {
    const fn = vi.fn().mockResolvedValue(null);
    await runWithAuthAdapterContext({ operation: 'createSession', models: ['Session'] }, fn);
    expect(fn).toHaveBeenCalled();
  });

  it('allows VerificationToken', async () => {
    const fn = vi.fn().mockResolvedValue(null);
    await runWithAuthAdapterContext(
      { operation: 'useVerificationToken', models: ['VerificationToken'] },
      fn
    );
    expect(fn).toHaveBeenCalled();
  });

  it('allows multiple auth models in one call (e.g. getSessionAndUser)', async () => {
    const fn = vi.fn().mockResolvedValue(null);
    await runWithAuthAdapterContext(
      { operation: 'getSessionAndUser', models: ['Session', 'User'] },
      fn
    );
    expect(fn).toHaveBeenCalled();
  });

  it('REFUSES Audit (business model) and never calls fn', async () => {
    const fn = vi.fn();

    await expect(
      runWithAuthAdapterContext({ operation: 'malicious', models: ['Audit' as never] }, fn)
    ).rejects.toBeInstanceOf(AuthAdapterModelNotAllowedError);

    expect(fn).not.toHaveBeenCalled();
    expect(mocks.runWithTenantBypass).not.toHaveBeenCalled();
  });

  it('REFUSES Proposal (business model)', async () => {
    const fn = vi.fn();
    await expect(
      runWithAuthAdapterContext({ operation: 'malicious', models: ['Proposal' as never] }, fn)
    ).rejects.toBeInstanceOf(AuthAdapterModelNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('REFUSES Finding (business model)', async () => {
    const fn = vi.fn();
    await expect(
      runWithAuthAdapterContext({ operation: 'malicious', models: ['Finding' as never] }, fn)
    ).rejects.toBeInstanceOf(AuthAdapterModelNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('REFUSES typo / unknown model', async () => {
    const fn = vi.fn();
    await expect(
      runWithAuthAdapterContext({ operation: 'typo', models: ['Useer' as never] }, fn)
    ).rejects.toBeInstanceOf(AuthAdapterModelNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('REFUSES mixed valid+invalid model list (deny-by-presence)', async () => {
    const fn = vi.fn();
    await expect(
      runWithAuthAdapterContext(
        { operation: 'mixed', models: ['User', 'Audit' as never] },
        fn
      )
    ).rejects.toBeInstanceOf(AuthAdapterModelNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
    expect(mocks.runWithTenantBypass).not.toHaveBeenCalled();
  });

  it('REFUSES empty model list', async () => {
    const fn = vi.fn();
    await expect(
      runWithAuthAdapterContext({ operation: 'empty', models: [] }, fn)
    ).rejects.toBeInstanceOf(AuthAdapterModelNotAllowedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('logs structured bypass entry with safe metadata only', async () => {
    const fn = vi.fn().mockResolvedValue({ id: 'u-1' });
    await runWithAuthAdapterContext(
      { operation: 'getUserByEmail', models: ['User'] },
      fn
    );

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth_adapter.bypass',
        operation: 'getUserByEmail',
        models: ['User'],
      }),
      expect.any(String)
    );
  });

  it('logs structured refusal when a disallowed model is passed', async () => {
    await runWithAuthAdapterContext(
      { operation: 'evil', models: ['Audit' as never] },
      vi.fn()
    ).catch(() => undefined);

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth_adapter.disallowed_model',
        operation: 'evil',
        attemptedModel: 'Audit',
      }),
      expect.any(String)
    );
  });

  it('passes operation name into the runWithTenantBypass reason for audit trail', async () => {
    await runWithAuthAdapterContext(
      { operation: 'linkAccount', models: ['Account'] },
      vi.fn().mockResolvedValue(null)
    );

    expect(mocks.runWithTenantBypass).toHaveBeenCalledWith(
      'auth-adapter:linkAccount',
      expect.any(Function)
    );
  });

  it('AuthAdapterModelNotAllowedError carries the attempted model', async () => {
    try {
      await runWithAuthAdapterContext(
        { operation: 'evil', models: ['Audit' as never] },
        vi.fn()
      );
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthAdapterModelNotAllowedError);
      expect((err as AuthAdapterModelNotAllowedError).attemptedModel).toBe('Audit');
      expect((err as Error).message).toContain('not in the auth identity allow-list');
    }
  });

  it('AUTH_ADAPTER_ALLOWED_MODELS is the canonical list and is frozen', () => {
    expect(AUTH_ADAPTER_ALLOWED_MODELS).toEqual(['User', 'Account', 'Session', 'VerificationToken']);
    expect(Object.isFrozen(AUTH_ADAPTER_ALLOWED_MODELS)).toBe(true);
  });
});

describe('isAuthAdapterModel', () => {
  it('returns true for allow-listed models', () => {
    expect(isAuthAdapterModel('User')).toBe(true);
    expect(isAuthAdapterModel('Account')).toBe(true);
    expect(isAuthAdapterModel('Session')).toBe(true);
    expect(isAuthAdapterModel('VerificationToken')).toBe(true);
  });

  it('returns false for business models', () => {
    expect(isAuthAdapterModel('Audit')).toBe(false);
    expect(isAuthAdapterModel('Proposal')).toBe(false);
    expect(isAuthAdapterModel('Finding')).toBe(false);
    expect(isAuthAdapterModel('Tenant')).toBe(false);
  });

  it('returns false for unknown / casing variations', () => {
    expect(isAuthAdapterModel('user')).toBe(false);
    expect(isAuthAdapterModel('USER')).toBe(false);
    expect(isAuthAdapterModel('')).toBe(false);
  });
});

// ─── Wrapped Prisma Adapter ───────────────────────────────────────────────────

describe('buildWrappedPrismaAdapter', () => {
  // We mock @auth/prisma-adapter so we don't need real DB access
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@auth/prisma-adapter');
  });

  it('routes every known adapter method through runWithAuthAdapterContext', async () => {
    const calls: Array<{ method: string }> = [];

    vi.doMock('@auth/prisma-adapter', () => ({
      PrismaAdapter: () => ({
        getUser: async () => {
          calls.push({ method: 'getUser' });
          return { id: 'u-1' };
        },
        createSession: async () => {
          calls.push({ method: 'createSession' });
          return { sessionToken: 'tok' };
        },
        useVerificationToken: async () => {
          calls.push({ method: 'useVerificationToken' });
          return null;
        },
      }),
    }));

    const { buildWrappedPrismaAdapter } = await import('@/lib/auth/wrappedPrismaAdapter');
    const adapter = buildWrappedPrismaAdapter({} as never);

    await (adapter as never as { getUser: (id: string) => Promise<unknown> }).getUser('u-1');
    await (adapter as never as { createSession: (s: unknown) => Promise<unknown> }).createSession({
      sessionToken: 'tok',
      userId: 'u-1',
      expires: new Date(),
    });
    await (adapter as never as { useVerificationToken: (a: unknown) => Promise<unknown> }).useVerificationToken({
      identifier: 'a',
      token: 'b',
    });

    expect(calls).toEqual([
      { method: 'getUser' },
      { method: 'createSession' },
      { method: 'useVerificationToken' },
    ]);

    // Each invocation must have gone through runWithTenantBypass
    expect(mocks.runWithTenantBypass).toHaveBeenCalledTimes(3);
    expect(mocks.runWithTenantBypass).toHaveBeenNthCalledWith(
      1,
      'auth-adapter:getUser',
      expect.any(Function)
    );
    expect(mocks.runWithTenantBypass).toHaveBeenNthCalledWith(
      2,
      'auth-adapter:createSession',
      expect.any(Function)
    );
    expect(mocks.runWithTenantBypass).toHaveBeenNthCalledWith(
      3,
      'auth-adapter:useVerificationToken',
      expect.any(Function)
    );
  });

  it('does NOT widen bypass for unknown adapter methods (forwards raw)', async () => {
    vi.doMock('@auth/prisma-adapter', () => ({
      PrismaAdapter: () => ({
        // Hypothetical future method we don't know about yet
        somethingNew: async () => 'raw-result',
      }),
    }));

    const { buildWrappedPrismaAdapter } = await import('@/lib/auth/wrappedPrismaAdapter');
    const adapter = buildWrappedPrismaAdapter({} as never);

    const result = await (adapter as Record<string, () => Promise<unknown>>)['somethingNew']();
    expect(result).toBe('raw-result');
    // Critically: bypass was NOT silently extended to a method we didn't audit.
    expect(mocks.runWithTenantBypass).not.toHaveBeenCalled();
  });

  it('passes through non-function fields untouched', async () => {
    vi.doMock('@auth/prisma-adapter', () => ({
      PrismaAdapter: () => ({
        someConstant: 'value',
        getUser: async () => ({ id: 'u-1' }),
      }),
    }));

    const { buildWrappedPrismaAdapter } = await import('@/lib/auth/wrappedPrismaAdapter');
    const adapter = buildWrappedPrismaAdapter({} as never);

    expect((adapter as Record<string, unknown>).someConstant).toBe('value');
  });
});
