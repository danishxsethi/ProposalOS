import crypto from 'crypto';
import { randomUUID } from 'crypto';

import { logger } from '@/lib/logger';
import { getObservabilityContext } from '@/lib/observability/context';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

import type { Prisma } from '@prisma/client';

export type AuditTrailEventType =
  | 'audit.requested'
  | 'audit.started'
  | 'audit.completed'
  | 'audit.failed'
  | 'proposal.generated'
  | 'proposal.sent'
  | 'proposal.delivered'
  | 'data.deletion_requested'
  | 'data.deletion_completed'
  | 'data.deletion_failed'
  | 'campaign.created'
  | 'plan.changed'
  | 'billing.event'
  | 'cleanup.completed';

export interface AuditTrailEventInput {
  eventType: AuditTrailEventType;
  tenantId?: string;
  auditId?: string;
  proposalId?: string;
  actorId?: string;
  triggerSource?: string;
  targetUrl?: string | null;
  modulesRun?: string[];
  findingsCount?: number;
  proposalGenerated?: boolean;
  proposalDelivered?: boolean;
  payload?: Record<string, unknown>;
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getEncryptionKey(): Buffer | null {
  const rawKey = process.env.AUDIT_TRAIL_ENCRYPTION_KEY;
  if (!rawKey) return null;

  return crypto.createHash('sha256').update(rawKey).digest();
}

function protectTargetUrl(targetUrl?: string | null): {
  encrypted: string | null;
  hash: string | null;
} {
  if (!targetUrl) return { encrypted: null, hash: null };

  const hash = hashValue(targetUrl);
  const key = getEncryptionKey();
  if (!key) {
    return { encrypted: null, hash };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(targetUrl, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':'),
    hash,
  };
}

async function withAuditTrailScope<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
  if (tenantId) {
    return runWithTenantAsync(tenantId, fn);
  }

  return runWithTenantBypass('audit-trail:system-event-read-write', fn);
}

async function getPreviousHash(
  tenantId: string | null,
  auditId?: string,
  proposalId?: string
): Promise<string | null> {
  const previousEvent = await prisma.auditTrailEvent.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(auditId ? { auditId } : {}),
      ...(proposalId ? { proposalId } : {}),
    },
    orderBy: { occurredAt: 'desc' },
    select: { eventHash: true },
  });

  return previousEvent?.eventHash ?? null;
}

export async function recordAuditTrailEvent(input: AuditTrailEventInput): Promise<void> {
  const context = getObservabilityContext();
  const occurredAt = new Date();
  const protectedUrl = protectTargetUrl(input.targetUrl);
  const effectiveTenantId = input.tenantId ?? context?.tenantId ?? null;

  try {
    await withAuditTrailScope(effectiveTenantId, async () => {
      const previousHash = await getPreviousHash(
        effectiveTenantId,
        input.auditId,
        input.proposalId
      );
      const eventHash = hashValue(
        JSON.stringify({
          eventType: input.eventType,
          occurredAt: occurredAt.toISOString(),
          correlationId: context?.correlationId,
          traceId: context?.traceId,
          tenantId: effectiveTenantId,
          auditId: input.auditId,
          proposalId: input.proposalId,
          previousHash,
          payload: input.payload ?? {},
          targetUrlHash: protectedUrl.hash,
        })
      );

      await prisma.auditTrailEvent.create({
        data: {
          id: randomUUID(),
          eventType: input.eventType,
          occurredAt,
          tenantId: effectiveTenantId,
          auditId: input.auditId ?? null,
          proposalId: input.proposalId ?? null,
          actorId: input.actorId ?? context?.actorId ?? null,
          triggerSource: input.triggerSource ?? context?.workflow ?? 'system',
          correlationId: context?.correlationId ?? null,
          traceId: context?.traceId ?? null,
          targetUrlEncrypted: protectedUrl.encrypted,
          targetUrlHash: protectedUrl.hash,
          modulesRun: input.modulesRun ?? [],
          findingsCount: input.findingsCount ?? null,
          proposalGenerated: input.proposalGenerated ?? false,
          proposalDelivered: input.proposalDelivered ?? false,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          previousHash,
          eventHash,
        },
      });
    });
  } catch (error) {
    logger.warn(
      {
        event: 'audit_trail.write_failed',
        eventType: input.eventType,
        auditId: input.auditId,
        proposalId: input.proposalId,
        tenantId: effectiveTenantId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to write audit trail event'
    );
  }
}
