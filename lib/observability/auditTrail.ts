import crypto from 'crypto';
import { randomUUID } from 'crypto';

import { logger } from '@/lib/logger';
import { getObservabilityContext } from '@/lib/observability/context';
import { prisma } from '@/lib/prisma';
import { isEncryptedField } from '@/lib/security/encryption/envelope';
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
  | 'cleanup.completed'
  // Stripe Webhooks
  | 'stripe.webhook_received'
  | 'stripe.webhook_signature_failed'
  | 'stripe.webhook_duplicate_ignored'
  | 'stripe.billing_updated'
  | 'stripe.billing_failed'
  | 'stripe.billing_paid'
  // Session / Security
  | 'session.created'
  | 'session.revoked'
  | 'session.blocked'
  // Case Study / PDF
  | 'casestudy.generated'
  | 'casestudy.downloaded'
  | 'casestudy.token_blocked'
  // Proposals
  | 'proposal.status_changed'
  | 'proposal.viewed'
  // API Keys
  | 'apikey.created'
  | 'apikey.revoked'
  | 'apikey.auth_success'
  | 'apikey.auth_failed'
  // Workers
  | 'worker.job_claimed'
  | 'worker.job_completed'
  | 'worker.job_failed'
  // Settings & Membership (P1)
  | 'tenant.branding_changed'
  | 'role.membership_changed'
  // Provisioning
  | 'tenant.provisioned'
  // Advanced Abuse & Security Blocking
  | 'abuse.rate_limited'
  | 'abuse.idempotency_replay'
  | 'abuse.invalid_token_rate_limited'
  | 'abuse.quota_exceeded'
  | 'abuse.worker_auth_failed'
  | 'abuse.cron_auth_failed'
  | 'abuse.webhook_signature_flood';

export interface AuditTrailEventInput {
  eventType: AuditTrailEventType;
  tenantId?: string | null;
  auditId?: string | null;
  proposalId?: string | null;
  actorId?: string | null;
  triggerSource?: string | null;
  targetUrl?: string | null;
  modulesRun?: string[];
  findingsCount?: number | null;
  proposalGenerated?: boolean;
  proposalDelivered?: boolean;
  payload?: Record<string, unknown> | null;
}

const EXACT_REDACT_KEYS = new Set([
  'authorization',
  'cookie',
  'session',
  'sessiontoken',
  'refreshtoken',
  'accesstoken',
  'weblinktoken',
  'magictoken',
  'apikey',
  'password',
  'secret',
  'stripesignature',
  'stripe-signature',
  'stripe_webhook_secret',
  'stripe_secret_key',
  'resend_api_key',
  'token',
  'signature',
  'privatekey',
  'clientsecret',
  'paymentmethod',
  'card',
]);

const SUBSTRING_REDACT_KEYS = [
  'secret',
  'token',
  'session',
  'key',
  'passwd',
  'password',
  'signature',
  'auth',
];

export function redactPayload(val: any, seen = new WeakSet()): any {
  if (val === null || val === undefined) {
    return val;
  }

  // Handle primitives
  if (typeof val !== 'object') {
    if (typeof val === 'string' && isEncryptedField(val)) {
      return '[ENCRYPTED]';
    }
    return val;
  }

  // Prevent infinite loops from circular references
  if (seen.has(val)) {
    return '[Circular]';
  }

  if (Array.isArray(val)) {
    const newArr: any[] = [];
    seen.add(val);
    for (const item of val) {
      newArr.push(redactPayload(item, seen));
    }
    return newArr;
  }

  if (val instanceof Date) {
    return val;
  }

  // Handle objects
  const redactedObj: Record<string, any> = {};
  seen.add(val);

  for (const key of Object.keys(val)) {
    const lowerKey = key.toLowerCase();
    const isContainer = typeof val[key] === 'object' && val[key] !== null;

    // Check if key is in EXACT list or matches substrings
    const shouldRedact =
      EXACT_REDACT_KEYS.has(lowerKey) ||
      SUBSTRING_REDACT_KEYS.some((sub) => lowerKey.includes(sub));

    if (shouldRedact && !isContainer) {
      redactedObj[key] = '[REDACTED]';
    } else {
      redactedObj[key] = redactPayload(val[key], seen);
    }
  }

  return redactedObj;
}

export function canonicalize(val: any): any {
  if (val === undefined || val === null) {
    return null;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalize);
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort();
    const sortedObj: Record<string, any> = {};
    for (const key of keys) {
      sortedObj[key] = canonicalize(val[key]);
    }
    return sortedObj;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  return val;
}

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function computeCanonicalHash(event: {
  eventType: string;
  occurredAt: Date | string;
  correlationId?: string | null;
  traceId?: string | null;
  tenantId?: string | null;
  auditId?: string | null;
  proposalId?: string | null;
  previousHash?: string | null;
  payload?: any;
  targetUrlHash?: string | null;
}): string {
  const ISOString =
    event.occurredAt instanceof Date
      ? event.occurredAt.toISOString()
      : new Date(event.occurredAt).toISOString();

  const canonicalObj = canonicalize({
    eventType: event.eventType,
    occurredAt: ISOString,
    correlationId: event.correlationId ?? null,
    traceId: event.traceId ?? null,
    tenantId: event.tenantId ?? null,
    auditId: event.auditId ?? null,
    proposalId: event.proposalId ?? null,
    previousHash: event.previousHash ?? null,
    payload: event.payload ?? {},
    targetUrlHash: event.targetUrlHash ?? null,
  });

  return hashValue(JSON.stringify(canonicalObj));
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
  auditId?: string | null,
  proposalId?: string | null
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

  // Redact payload recursively and verify size constraints (100 KB limit)
  const redactedPayloadData = redactPayload(input.payload ?? {});
  const serializedPayload = JSON.stringify(redactedPayloadData);
  if (serializedPayload.length > 100 * 1024) {
    throw new Error('AuditTrailEvent payload size exceeds 100 KB limit.');
  }

  try {
    await withAuditTrailScope(effectiveTenantId, async () => {
      const previousHash = await getPreviousHash(
        effectiveTenantId,
        input.auditId,
        input.proposalId
      );

      const eventHash = computeCanonicalHash({
        eventType: input.eventType,
        occurredAt,
        correlationId: context?.correlationId,
        traceId: context?.traceId,
        tenantId: effectiveTenantId,
        auditId: input.auditId,
        proposalId: input.proposalId,
        previousHash,
        payload: redactedPayloadData,
        targetUrlHash: protectedUrl.hash,
      });

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
          payload: redactedPayloadData as Prisma.InputJsonValue,
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
    // Explicitly rethrow if it's billing or security-critical
    const isCritical =
      input.eventType.startsWith('stripe.') ||
      input.eventType.startsWith('session.') ||
      input.eventType.startsWith('apikey.');
    if (isCritical) {
      throw error;
    }
  }
}

export async function verifyAuditChain(tenantId?: string): Promise<{
  valid: boolean;
  tamperedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let tamperedCount = 0;

  try {
    return await runWithTenantBypass('audit-trail:verification', async () => {
      const events = await prisma.auditTrailEvent.findMany({
        where: tenantId ? { tenantId } : {},
        orderBy: { occurredAt: 'asc' },
      });

      const eventMap = new Map<string, (typeof events)[0]>();
      for (const event of events) {
        eventMap.set(event.eventHash, event);
      }

      for (const event of events) {
        // 1. Verify content integrity
        const calculatedHash = computeCanonicalHash({
          eventType: event.eventType,
          occurredAt: event.occurredAt,
          correlationId: event.correlationId,
          traceId: event.traceId,
          tenantId: event.tenantId,
          auditId: event.auditId,
          proposalId: event.proposalId,
          previousHash: event.previousHash,
          payload: event.payload,
          targetUrlHash: event.targetUrlHash,
        });

        if (calculatedHash !== event.eventHash) {
          tamperedCount++;
          errors.push(
            `Event ${event.id} hash mismatch. DB eventHash: ${event.eventHash}, calculated: ${calculatedHash}`
          );
          continue;
        }

        // 2. Verify chain linkage
        if (event.previousHash) {
          const predecessor = eventMap.get(event.previousHash);
          if (!predecessor) {
            // If we are filtering by tenant, check if predecessor actually exists in DB
            const existsInDb = await prisma.auditTrailEvent.findUnique({
              where: { eventHash: event.previousHash },
            });
            if (!existsInDb) {
              tamperedCount++;
              errors.push(
                `Event ${event.id} previousHash ${event.previousHash} not found (chain broken/deleted).`
              );
            }
          } else {
            // Predecessor is found, verify its timestamp is <= current event
            if (new Date(predecessor.occurredAt) > new Date(event.occurredAt)) {
              errors.push(
                `Temporal anomaly: Predecessor event ${predecessor.id} occurred after event ${event.id}.`
              );
            }
          }
        }
      }

      return {
        valid: errors.length === 0,
        tamperedCount,
        errors,
      };
    });
  } catch (error) {
    return {
      valid: false,
      tamperedCount: 1,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
