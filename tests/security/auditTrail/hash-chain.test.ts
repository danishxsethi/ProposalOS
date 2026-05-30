import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  computeCanonicalHash,
  canonicalize,
  verifyAuditChain,
} from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditTrailEvent: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/tenant/context', () => ({
  runWithTenantBypass: vi.fn((reason, cb) => cb()),
}));

describe('Audit Trail Hash Chaining & Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('canonicalize should be fully deterministic and ignore/convert undefined to null, sorting keys recursively', () => {
    const obj1 = {
      b: 2,
      a: undefined,
      c: {
        y: 'hello',
        x: null,
      },
    };

    const obj2 = {
      c: {
        x: undefined,
        y: 'hello',
      },
      b: 2,
      a: null,
    };

    const canonical1 = canonicalize(obj1);
    const canonical2 = canonicalize(obj2);

    expect(JSON.stringify(canonical1)).toBe(JSON.stringify(canonical2));
    expect(Object.keys(canonical1)).toEqual(['a', 'b', 'c']);
    expect(Object.keys(canonical1.c)).toEqual(['x', 'y']);
  });

  it('should successfully verify a valid hash chain', async () => {
    const occurredAt = new Date('2026-05-20T12:00:00.000Z');

    const event1 = {
      id: 'event-1',
      eventType: 'audit.requested',
      occurredAt,
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: null,
      payload: { test: 123 },
      targetUrlHash: null,
      eventHash: '',
    };
    event1.eventHash = computeCanonicalHash(event1);

    const event2 = {
      id: 'event-2',
      eventType: 'audit.completed',
      occurredAt: new Date('2026-05-20T12:05:00.000Z'),
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: event1.eventHash,
      payload: { test: 456 },
      targetUrlHash: null,
      eventHash: '',
    };
    event2.eventHash = computeCanonicalHash(event2);

    // Mock prisma responses
    vi.mocked(prisma.auditTrailEvent.findMany).mockResolvedValue([event1, event2] as any);

    const result = await verifyAuditChain('tenant-1');

    expect(result.valid).toBe(true);
    expect(result.tamperedCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect when an event in the chain has been tampered with (content modified)', async () => {
    const occurredAt = new Date('2026-05-20T12:00:00.000Z');

    const event1 = {
      id: 'event-1',
      eventType: 'audit.requested',
      occurredAt,
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: null,
      payload: { test: 123 },
      targetUrlHash: null,
      eventHash: '',
    };
    event1.eventHash = computeCanonicalHash(event1);

    // Now, simulate DB tampering where the payload has been altered without updating the eventHash
    const tamperedEvent1 = {
      ...event1,
      payload: { test: 'tampered-value' }, // altered
    };

    vi.mocked(prisma.auditTrailEvent.findMany).mockResolvedValue([tamperedEvent1] as any);

    const result = await verifyAuditChain('tenant-1');

    expect(result.valid).toBe(false);
    expect(result.tamperedCount).toBe(1);
    expect(result.errors[0]).toContain('hash mismatch');
  });

  it('should detect when the chain linkage is broken (missing predecessor)', async () => {
    const occurredAt = new Date('2026-05-20T12:00:00.000Z');

    const event1 = {
      id: 'event-1',
      eventType: 'audit.requested',
      occurredAt,
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: null,
      payload: { test: 123 },
      targetUrlHash: null,
      eventHash: 'hash-of-event-1',
    };

    const event2 = {
      id: 'event-2',
      eventType: 'audit.completed',
      occurredAt: new Date('2026-05-20T12:05:00.000Z'),
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: 'hash-of-event-1', // points to event1, but event1 is deleted/missing
      payload: { test: 456 },
      targetUrlHash: null,
      eventHash: '',
    };
    event2.eventHash = computeCanonicalHash(event2);

    // Mock prisma returning only event2, simulating that event1 was deleted
    vi.mocked(prisma.auditTrailEvent.findMany).mockResolvedValue([event2] as any);
    // Simulate lookup of predecessor in DB also returns null
    vi.mocked(prisma.auditTrailEvent.findUnique).mockResolvedValue(null);

    const result = await verifyAuditChain('tenant-1');

    expect(result.valid).toBe(false);
    expect(result.tamperedCount).toBe(1);
    expect(result.errors[0]).toContain(
      'previousHash hash-of-event-1 not found (chain broken/deleted)'
    );
  });

  it('should detect temporal anomalies when a predecessor occurred in the future', async () => {
    const event1 = {
      id: 'event-1',
      eventType: 'audit.requested',
      occurredAt: new Date('2026-05-20T13:00:00.000Z'), // FUTURE
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: null,
      payload: {},
      targetUrlHash: null,
      eventHash: '',
    };
    event1.eventHash = computeCanonicalHash(event1);

    const event2 = {
      id: 'event-2',
      eventType: 'audit.completed',
      occurredAt: new Date('2026-05-20T12:00:00.000Z'), // PAST
      tenantId: 'tenant-1',
      auditId: null,
      proposalId: null,
      correlationId: null,
      traceId: null,
      previousHash: event1.eventHash,
      payload: {},
      targetUrlHash: null,
      eventHash: '',
    };
    event2.eventHash = computeCanonicalHash(event2);

    vi.mocked(prisma.auditTrailEvent.findMany).mockResolvedValue([event2, event1] as any);

    const result = await verifyAuditChain('tenant-1');

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Temporal anomaly');
  });
});
