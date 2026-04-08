import crypto from 'crypto';
import { randomUUID } from 'crypto';

import { logger } from '@/lib/logger';
import { getObservabilityContext } from '@/lib/observability/context';
import { prisma } from '@/lib/prisma';

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

function protectTargetUrl(targetUrl?: string | null): { encrypted: string | null; hash: string | null } {
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

async function getPreviousHash(auditId?: string, proposalId?: string): Promise<string | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ eventHash: string | null }>>(
    `
      SELECT "eventHash"
      FROM "AuditTrailEvent"
      WHERE ($1::text IS NULL OR "auditId" = $1::text)
        AND ($2::text IS NULL OR "proposalId" = $2::text)
      ORDER BY "occurredAt" DESC
      LIMIT 1
    `,
    auditId ?? null,
    proposalId ?? null
  );

  return rows[0]?.eventHash ?? null;
}

export async function recordAuditTrailEvent(input: AuditTrailEventInput): Promise<void> {
  const context = getObservabilityContext();
  const occurredAt = new Date();
  const protectedUrl = protectTargetUrl(input.targetUrl);

  try {
    const previousHash = await getPreviousHash(input.auditId, input.proposalId);
    const eventHash = hashValue(
      JSON.stringify({
        eventType: input.eventType,
        occurredAt: occurredAt.toISOString(),
        correlationId: context?.correlationId,
        traceId: context?.traceId,
        tenantId: input.tenantId ?? context?.tenantId,
        auditId: input.auditId,
        proposalId: input.proposalId,
        previousHash,
        payload: input.payload ?? {},
        targetUrlHash: protectedUrl.hash,
      })
    );

    await prisma.$executeRawUnsafe(
      `
        INSERT INTO "AuditTrailEvent" (
          "id",
          "eventType",
          "occurredAt",
          "tenantId",
          "auditId",
          "proposalId",
          "actorId",
          "triggerSource",
          "correlationId",
          "traceId",
          "targetUrlEncrypted",
          "targetUrlHash",
          "modulesRun",
          "findingsCount",
          "proposalGenerated",
          "proposalDelivered",
          "payload",
          "previousHash",
          "eventHash"
        ) VALUES (
          $1::text,
          $2::text,
          $3::timestamp,
          $4::text,
          $5::text,
          $6::text,
          $7::text,
          $8::text,
          $9::text,
          $10::text,
          $11::text,
          $12::text,
          $13::jsonb,
          $14::integer,
          $15::boolean,
          $16::boolean,
          $17::jsonb,
          $18::text,
          $19::text
        )
      `,
      randomUUID(),
      input.eventType,
      occurredAt,
      input.tenantId ?? context?.tenantId ?? null,
      input.auditId ?? null,
      input.proposalId ?? null,
      input.actorId ?? context?.actorId ?? null,
      input.triggerSource ?? context?.workflow ?? 'system',
      context?.correlationId ?? null,
      context?.traceId ?? null,
      protectedUrl.encrypted,
      protectedUrl.hash,
      JSON.stringify(input.modulesRun ?? []),
      input.findingsCount ?? null,
      input.proposalGenerated ?? false,
      input.proposalDelivered ?? false,
      JSON.stringify(input.payload ?? {}),
      previousHash,
      eventHash
    );
  } catch (error) {
    logger.warn(
      {
        event: 'audit_trail.write_failed',
        eventType: input.eventType,
        auditId: input.auditId,
        proposalId: input.proposalId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to write audit trail event'
    );
  }
}