/**
 * tests/security/wave1-audit-trail-criticality.test.ts
 *
 * P2-23 (audit-trail reliability half): recordAuditTrailEvent() already logged write
 * failures and rethrew for stripe, session, and apikey events (pre-existing). This wave
 * extends the criticality classification to also cover destructive tenant-deletion events
 * (data.deletion_...) and role/permission-change events (role...), so a failed write for
 * those categories can never be silently swallowed as if the destructive/security action's
 * audit trail succeeded.
 *
 * Non-critical categories (e.g. audit.*, proposal.*) must remain best-effort (logged, not
 * rethrown) -- this is a criticality classification, not a blanket "block every request"
 * change.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findFirst: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditTrailEvent: {
      create: mocks.create,
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: mocks.loggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/observability/context', () => ({
  getObservabilityContext: vi.fn(() => null),
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantAsync: (_tenantId: string, fn: () => Promise<unknown>) => fn(),
  runWithTenantBypass: (_reason: string, fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/security/encryption/envelope', () => ({
  isEncryptedField: () => false,
}));

const importAuditTrail = () => import('@/lib/observability/auditTrail');

describe('recordAuditTrailEvent — criticality classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockRejectedValue(new Error('DB write failed'));
  });

  it.each([
    ['data.deletion_auth', 'tenant-deletion authorization'],
    ['data.deletion_completed', 'tenant-deletion completion'],
    ['data.deletion_failed', 'tenant-deletion failure record'],
  ] as const)(
    'rethrows on write failure for destructive event %s (%s) -- never silently swallowed',
    async (eventType) => {
      const { recordAuditTrailEvent } = await importAuditTrail();
      await expect(recordAuditTrailEvent({ eventType, tenantId: 'tenant-1' })).rejects.toThrow(
        'DB write failed'
      );
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'audit_trail.write_failed', eventType }),
        expect.any(String)
      );
    }
  );

  it('rethrows on write failure for apikey.created/revoked (pre-existing, re-verified)', async () => {
    const { recordAuditTrailEvent } = await importAuditTrail();
    await expect(
      recordAuditTrailEvent({ eventType: 'apikey.created', tenantId: 'tenant-1' })
    ).rejects.toThrow('DB write failed');
    await expect(
      recordAuditTrailEvent({ eventType: 'apikey.revoked', tenantId: 'tenant-1' })
    ).rejects.toThrow('DB write failed');
  });

  it('rethrows on write failure for session.* events (pre-existing, re-verified)', async () => {
    const { recordAuditTrailEvent } = await importAuditTrail();
    await expect(
      recordAuditTrailEvent({ eventType: 'session.revoked', tenantId: 'tenant-1' })
    ).rejects.toThrow('DB write failed');
  });

  it('does NOT rethrow for non-critical event categories -- logs and swallows', async () => {
    const { recordAuditTrailEvent } = await importAuditTrail();
    await expect(
      recordAuditTrailEvent({ eventType: 'audit.completed', tenantId: 'tenant-1' })
    ).resolves.toBeUndefined();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'audit_trail.write_failed', eventType: 'audit.completed' }),
      expect.any(String)
    );
  });

  it('does not throw and does not log when the write succeeds', async () => {
    const { recordAuditTrailEvent } = await importAuditTrail();
    mocks.create.mockResolvedValue({});
    await expect(
      recordAuditTrailEvent({ eventType: 'apikey.created', tenantId: 'tenant-1' })
    ).resolves.toBeUndefined();
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });
});
