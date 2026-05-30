// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';

// Mock prisma and recordAuditTrailEvent
vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditTrailEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    proposal: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    audit: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditJob: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/observability/context', () => ({
  getObservabilityContext: () => ({
    tenantId: 'mock-tenant-id',
    actorId: 'mock-actor-id',
    correlationId: 'mock-correlation-id',
    traceId: 'mock-trace-id',
    workflow: 'mock-workflow',
  }),
}));

describe('Audit Trail Integration & Sensitive Action Logging (Hardening Target #9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Emits audit trail event correctly with automatic payload redaction and hashing', async () => {
    const rawPayload = {
      apiKey: 'sk_live_512345',
      someSafeField: 'safe_value',
      nested: {
        password: 'super_secret_password_123',
        safeNestedField: 'nested_safe',
      },
    };

    await recordAuditTrailEvent({
      eventType: 'plan.changed',
      tenantId: 'tenant-1',
      payload: rawPayload,
    });

    expect(prisma.auditTrailEvent.create).toHaveBeenCalledTimes(1);
    const callArgs = (prisma.auditTrailEvent.create as any).mock.calls[0][0];

    // Assert event fields
    expect(callArgs.data.eventType).toBe('plan.changed');
    expect(callArgs.data.tenantId).toBe('tenant-1');
    expect(callArgs.data.correlationId).toBe('mock-correlation-id');

    // Assert redaction is applied recursively
    expect(callArgs.data.payload.apiKey).toBe('[REDACTED]');
    expect(callArgs.data.payload.someSafeField).toBe('safe_value');
    expect(callArgs.data.payload.nested.password).toBe('[REDACTED]');
    expect(callArgs.data.payload.nested.safeNestedField).toBe('nested_safe');

    // Assert hashes are computed and linked correctly
    expect(callArgs.data.eventHash).toBeDefined();
    expect(typeof callArgs.data.eventHash).toBe('string');
  });

  it('2. Enforces metadata size limit (throws error if payload exceeds 100 KB)', async () => {
    const giantPayload: Record<string, string> = {};
    for (let i = 0; i < 2000; i++) {
      giantPayload[`field_${i}`] = 'a'.repeat(100); // Exceeds 100 KB
    }

    await expect(
      recordAuditTrailEvent({
        eventType: 'plan.changed',
        tenantId: 'tenant-1',
        payload: giantPayload,
      })
    ).rejects.toThrow('AuditTrailEvent payload size exceeds 100 KB limit.');
  });

  it('3. Failures in critical security/billing events are explicitly rethrown', async () => {
    // Force database write error
    (prisma.auditTrailEvent.create as any).mockRejectedValueOnce(new Error('DB is offline'));

    // Critical event should throw
    await expect(
      recordAuditTrailEvent({
        eventType: 'stripe.billing_failed',
        tenantId: 'tenant-1',
      })
    ).rejects.toThrow('DB is offline');

    // Non-critical event should swallow and NOT throw
    (prisma.auditTrailEvent.create as any).mockRejectedValueOnce(new Error('DB is offline'));
    await expect(
      recordAuditTrailEvent({
        eventType: 'campaign.created',
        tenantId: 'tenant-1',
      })
    ).resolves.not.toThrow();
  });
});
