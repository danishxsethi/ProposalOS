// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted Mocks ────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  capturedConfig: null as any,

  // prisma
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  proposalFindUnique: vi.fn(),
  apiKeyFindUnique: vi.fn(),
  apiKeyUpdate: vi.fn(),

  // tenant context
  runWithTenantAsync: vi.fn(),
  runWithTenantBypass: vi.fn(),

  // next/headers
  headers: vi.fn(),

  // logger
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

// Mock prisma client
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      create: mocks.sessionCreate,
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
    },
    proposal: {
      findUnique: mocks.proposalFindUnique,
    },
    apiKey: {
      findUnique: mocks.apiKeyFindUnique,
      update: mocks.apiKeyUpdate,
    },
  },
}));

// Mock tenant/context
vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: mocks.runWithTenantAsync,
  runWithTenantBypass: mocks.runWithTenantBypass,
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    debug: vi.fn(),
  },
}));

// Mock next-auth to capture configuration callbacks and events
vi.mock('next-auth', () => {
  return {
    default: (config: any) => {
      mocks.capturedConfig = config;
      return {
        handlers: { GET: vi.fn(), POST: vi.fn() },
        auth: vi.fn(),
        signIn: vi.fn(),
        signOut: vi.fn(),
      };
    },
  };
});

// Mock next-auth config (auth.config.ts) to keep it simple and test-friendly
vi.mock('@/lib/auth.config', () => ({
  authConfig: {
    callbacks: {
      jwt: vi.fn().mockImplementation(({ token }) => token),
      session: vi.fn().mockImplementation(({ session }) => session),
    },
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

// Import lib/auth to trigger next-auth mock capture
import '@/lib/auth';
import { GET as getProposalToken } from '@/app/api/proposal/token/[token]/route';
import { withAuth } from '@/lib/middleware/auth';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Session Security, Device Context & RTR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.capturedConfig.callbacks.jwt.mockClear?.();

    // Default tenant bypass passthrough
    mocks.runWithTenantBypass.mockImplementation(
      async (_reason: string, fn: () => Promise<unknown>) => fn()
    );

    // Default runWithTenantAsync passthrough
    mocks.runWithTenantAsync.mockImplementation(
      async (_tenantId: string, fn: () => Promise<unknown>) => fn()
    );

    // Default mock headers return value
    mocks.headers.mockResolvedValue({
      get: (key: string) => {
        if (key === 'user-agent') return 'Mozilla/5.0 TestBrowser';
        if (key === 'x-forwarded-for') return '192.168.1.5, 10.0.0.1';
        return null;
      },
    });
  });

  // ============================================================================
  // JWT / SESSION LIFE CYCLE CALLBACKS (lib/auth.ts)
  // ============================================================================

  describe('NextAuth jwt callback - initial sign-in (session creation)', () => {
    it('creates a session in database with device context tracking and privacy-safe IP hashing', async () => {
      const mockUser = { id: 'u-1', email: 'test@example.com', role: 'member', tenantId: 't-1' };
      const mockToken = { email: 'test@example.com' };

      // Call jwt callback with user present (initial login)
      const tokenResult = await mocks.capturedConfig.callbacks.jwt({
        token: mockToken,
        user: mockUser,
      });

      expect(tokenResult).toBeDefined();
      expect(tokenResult.jti).toBeDefined(); // Unique session token JTI should be created

      // Check if session.create is called with the expected fields and hashed values
      expect(mocks.sessionCreate).toHaveBeenCalledTimes(1);
      const createArgs = mocks.sessionCreate.mock.calls[0][0].data;
      expect(createArgs.sessionToken).toBe(tokenResult.jti);
      expect(createArgs.userId).toBe('u-1');
      expect(createArgs.expires).toBeInstanceOf(Date);
      expect(createArgs.userAgentHash).toBeDefined(); // SHA-256 of Mozilla/5.0 TestBrowser
      expect(createArgs.ipHash).toBeDefined(); // SHA-256 of 192.168.1.0 (privacy-safe IP)
    });
  });

  describe('NextAuth jwt callback - subsequent verification requests', () => {
    it('allows access for a valid, active, and unexpired database session', async () => {
      const mockToken = { jti: 's-valid-token', email: 'test@example.com' };

      // Mock session record found, unexpired, and unrevoked
      mocks.sessionFindUnique.mockResolvedValue({
        id: 'sess-1',
        sessionToken: 's-valid-token',
        userId: 'u-1',
        expires: new Date(Date.now() + 30000), // Active
        revokedAt: null,
        user: { id: 'u-1', email: 'test@example.com', tenantId: 't-1' },
      });

      const tokenResult = await mocks.capturedConfig.callbacks.jwt({
        token: mockToken,
      });

      expect(tokenResult).not.toBeNull();
      expect(tokenResult?.jti).toBe('s-valid-token');

      // Verifies session record update is triggered asynchronously for lastSeenAt
      expect(mocks.sessionUpdate).toHaveBeenCalledTimes(1);
      expect(mocks.sessionUpdate.mock.calls[0][0].where.sessionToken).toBe('s-valid-token');
    });

    it('rejects access when session does not exist in database', async () => {
      const mockToken = { jti: 's-unknown-token' };
      mocks.sessionFindUnique.mockResolvedValue(null);

      const tokenResult = await mocks.capturedConfig.callbacks.jwt({
        token: mockToken,
      });

      expect(tokenResult).toBeNull(); // Access denied
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 's-unknown-token' }),
        expect.stringContaining('Session record not found')
      );
    });

    it('rejects access when session is marked as revoked in database', async () => {
      const mockToken = { jti: 's-revoked-token' };
      mocks.sessionFindUnique.mockResolvedValue({
        id: 'sess-1',
        sessionToken: 's-revoked-token',
        userId: 'u-1',
        expires: new Date(Date.now() + 30000),
        revokedAt: new Date(),
        revokeReason: 'logout',
        user: { id: 'u-1', email: 'test@example.com' },
      });

      const tokenResult = await mocks.capturedConfig.callbacks.jwt({
        token: mockToken,
      });

      expect(tokenResult).toBeNull(); // Access denied
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 's-revoked-token' }),
        expect.stringContaining('revoked session')
      );
    });

    it('rejects access when session has expired', async () => {
      const mockToken = { jti: 's-expired-token' };
      mocks.sessionFindUnique.mockResolvedValue({
        id: 'sess-1',
        sessionToken: 's-expired-token',
        userId: 'u-1',
        expires: new Date(Date.now() - 30000), // Past
        revokedAt: null,
        user: { id: 'u-1', email: 'test@example.com' },
      });

      const tokenResult = await mocks.capturedConfig.callbacks.jwt({
        token: mockToken,
      });

      expect(tokenResult).toBeNull(); // Access denied
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 's-expired-token' }),
        expect.stringContaining('expired session')
      );
    });

    it('rejects access when user is deleted (missing user association)', async () => {
      const mockToken = { jti: 's-token-orphaned' };
      mocks.sessionFindUnique.mockResolvedValue({
        id: 'sess-1',
        sessionToken: 's-token-orphaned',
        userId: 'u-1',
        expires: new Date(Date.now() + 30000),
        revokedAt: null,
        user: null, // User has been deleted/disabled
      });

      const tokenResult = await mocks.capturedConfig.callbacks.jwt({
        token: mockToken,
      });

      expect(tokenResult).toBeNull(); // Access denied
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ jti: 's-token-orphaned' }),
        expect.stringContaining('associated with session not found')
      );
    });
  });

  describe('NextAuth events.signOut (logout invalidation)', () => {
    it('revokes session record in database immediately on signOut', async () => {
      const mockMessage = { token: { jti: 's-token-to-logout' } };

      await mocks.capturedConfig.events.signOut(mockMessage);

      expect(mocks.sessionUpdate).toHaveBeenCalledTimes(1);
      const updateArgs = mocks.sessionUpdate.mock.calls[0][0];
      expect(updateArgs.where.sessionToken).toBe('s-token-to-logout');
      expect(updateArgs.data.revokedAt).toBeInstanceOf(Date);
      expect(updateArgs.data.revokeReason).toBe('logout');
    });
  });

  // ============================================================================
  // CLIENT MAGIC LINK & PROPOSAL SHARE TOKEN HARDENING (Phase 3)
  // ============================================================================

  describe('GET /api/proposal/token/[token] - Public share link', () => {
    it('allows access to valid, unexpired, and non-rejected proposals', async () => {
      mocks.proposalFindUnique.mockResolvedValue({
        id: 'prop-1',
        createdAt: new Date(), // Just created
        status: 'READY',
        executiveSummary: 'Test Summary',
        audit: {
          businessName: 'Acme Corp',
          businessCity: 'Denver',
          businessIndustry: 'Tech',
          findings: [],
        },
      });

      const res = await getProposalToken(
        new Request('http://localhost/api/proposal/token/valid-token'),
        { params: Promise.resolve({ token: 'valid-token' }) }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe('prop-1');
      expect(data.businessName).toBe('Acme Corp');
    });

    it('rejects access with 410 Gone if proposal status is REJECTED', async () => {
      mocks.proposalFindUnique.mockResolvedValue({
        id: 'prop-1',
        createdAt: new Date(),
        status: 'REJECTED',
        audit: {
          businessName: 'Acme Corp',
        },
      });

      const res = await getProposalToken(
        new Request('http://localhost/api/proposal/token/rejected-token'),
        { params: Promise.resolve({ token: 'rejected-token' }) }
      );

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.error).toBe('Proposal has been rejected');
    });

    it('rejects access with 410 Gone if proposal share token is older than 90 days', async () => {
      const ninetyOneDaysAgo = new Date();
      ninetyOneDaysAgo.setDate(ninetyOneDaysAgo.getDate() - 91);

      mocks.proposalFindUnique.mockResolvedValue({
        id: 'prop-1',
        createdAt: ninetyOneDaysAgo,
        status: 'SENT',
        audit: {
          businessName: 'Acme Corp',
        },
      });

      const res = await getProposalToken(
        new Request('http://localhost/api/proposal/token/expired-token'),
        { params: Promise.resolve({ token: 'expired-token' }) }
      );

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.error).toBe('Proposal has expired');
    });
  });

  // ============================================================================
  // MIDDLEWARE TENANT SCOPING & BOUNDARY TESTS (withAuth)
  // ============================================================================

  describe('withAuth Middleware Boundary & API Key verification', () => {
    it('correctly executes within derived session tenant context', async () => {
      // Mock active session
      const mockSession = {
        user: {
          id: 'u-1',
          email: 'user@tenant-a.com',
          role: 'member',
          tenantId: 'tenant-a',
        },
      };

      // Import the captured session auth mock
      const { auth } = await import('@/lib/auth');
      vi.mocked(auth).mockResolvedValue(mockSession as any);

      const req = new Request('http://localhost/api/protected');
      const mockHandler = vi.fn().mockResolvedValue(new Response('ok'));

      const wrappedHandler = withAuth(mockHandler);
      const res = await wrappedHandler(req);

      expect(res.status).toBe(200);
      expect(mocks.runWithTenantAsync).toHaveBeenCalledWith('tenant-a', expect.any(Function));
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('rejects session authentication if tenantId is missing in session', async () => {
      const mockSession = {
        user: {
          id: 'u-1',
          email: 'user@tenant-a.com',
          role: 'member',
          tenantId: null, // Missing tenant association
        },
      };

      const { auth } = await import('@/lib/auth');
      vi.mocked(auth).mockResolvedValue(mockSession as any);

      const req = new Request('http://localhost/api/protected');
      const mockHandler = vi.fn();

      const wrappedHandler = withAuth(mockHandler);
      const res = await wrappedHandler(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('No tenant associated');
      expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('rejects API Key authentication if key is inactive', async () => {
      // API keys use SHA-256 hash lookup. Mock pe_live_xxx key not found / inactive
      mocks.apiKeyFindUnique.mockResolvedValue({
        id: 'key-1',
        tenantId: 'tenant-a',
        isActive: false, // Inactive key
        expiresAt: null,
        rateLimitPerDay: 1000,
        usageCount: 0,
        tenant: { planTier: 'pro' },
      });

      const req = new Request('http://localhost/api/protected', {
        headers: { Authorization: 'Bearer pe_live_key123' },
      });
      const mockHandler = vi.fn();

      const wrappedHandler = withAuth(mockHandler);
      const res = await wrappedHandler(req);

      expect(res.status).toBe(401); // API Key revoked or inactive returns 401 Unauthorized
      const data = await res.json();
      expect(data.error).toBe('Invalid API Key');
      expect(mocks.runWithTenantAsync).not.toHaveBeenCalled();
    });

    it('rejects API Key authentication if key is expired', async () => {
      mocks.apiKeyFindUnique.mockResolvedValue({
        id: 'key-1',
        tenantId: 'tenant-a',
        isActive: true,
        expiresAt: new Date(Date.now() - 30000), // Expired
        rateLimitPerDay: 1000,
        usageCount: 0,
        tenant: { planTier: 'pro' },
      });

      const req = new Request('http://localhost/api/protected', {
        headers: { Authorization: 'Bearer pe_live_key123' },
      });
      const mockHandler = vi.fn();

      const wrappedHandler = withAuth(mockHandler);
      const res = await wrappedHandler(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe('Invalid API Key');
    });
  });
});
