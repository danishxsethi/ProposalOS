/**
 * lib/retention/lifecycleSafety.ts
 *
 * Wave 9C shared safety boundary for recurring lifecycle communications
 * (NPS, win-back, re-engagement, upsell). Mirrors the Wave 9A outreach
 * outboundSafety contract so every lifecycle send enforces:
 *   - explicit production delivery gate (OUTBOUND_DELIVERY_ENABLED)
 *   - suppression / unsubscribe recheck immediately before send
 *   - stable idempotency (reuses lib/outreach/outboundSafety's claim store)
 *
 * This does not introduce a second outbound framework: it wraps the existing
 * Wave 9A primitives so lifecycle callers get the same guarantees outreach/
 * follow-up sends already have.
 */

import { createHash } from 'crypto';

import {
  claimOutboundSend,
  completeOutboundSend,
  markOutboundSendUnknown,
  type OutboundClaim,
  outboundDeliveryEnabled,
  releaseOutboundSend,
} from '@/lib/outreach/outboundSafety';
import { prisma } from '@/lib/prisma';
import {
  claimLifecycleOccurrence,
  completeLifecycleOccurrence,
  ensureLifecycleOccurrence,
  lifecycleDispatchAllowed,
  markLifecycleReconciliation,
} from '@/lib/retention/lifecycleControl';
import type { LifecycleWorkflow } from '@/lib/retention/lifecycleControl';

export interface LifecycleSendGuardInput {
  tenantId: string;
  idempotencyKey: string;
  recipientEmail: string;
  workflow: LifecycleWorkflow;
  entityId: string;
  occurrenceKey: string;
  /** Per-tenant/day cap; lifecycle sends default to a generous cap unless overridden. */
  dailyCap?: number;
}

export type LifecycleSendGuard =
  | { allowed: true; claim: OutboundClaim & { status: 'claimed' } }
  | { allowed: false; reason: string };

function recipientHash(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Single recheck point every lifecycle sender (NPS, win-back, re-engagement,
 * upsell notification) must call immediately before invoking a provider.
 */
export async function guardLifecycleSend(
  input: LifecycleSendGuardInput
): Promise<LifecycleSendGuard> {
  if (!input.tenantId || !input.recipientEmail) {
    return { allowed: false, reason: 'tenantId and recipientEmail are required' };
  }
  if (!outboundDeliveryEnabled()) {
    return { allowed: false, reason: 'OUTBOUND_DELIVERY_ENABLED is not true' };
  }

  const controlInput = { ...input, recipientHash: recipientHash(input.recipientEmail) };
  await ensureLifecycleOccurrence(controlInput);

  const blocked = await prisma.emailBlocklist.findUnique({
    where: { email: input.recipientEmail },
    select: { id: true, reason: true },
  });
  if (blocked) {
    await (prisma as any).lifecycleOccurrence?.updateMany?.({
      where: {
        tenantId: input.tenantId,
        workflow: input.workflow,
        entityId: input.entityId,
        occurrenceKey: input.occurrenceKey,
        status: { not: 'CANCELLED' },
      },
      data: { status: 'SUPPRESSED', cancellationReason: blocked.reason ?? 'suppressed' },
    });
    return { allowed: false, reason: 'Recipient is suppressed' };
  }

  if (!(await lifecycleDispatchAllowed(controlInput))) {
    return { allowed: false, reason: 'lifecycle occurrence is cancelled or terminal' };
  }

  const claim = await claimOutboundSend({
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
    dailyCap: input.dailyCap ?? 1000,
  });

  if (claim.status !== 'claimed') {
    return { allowed: false, reason: claim.status };
  }

  if (!(await claimLifecycleOccurrence(controlInput))) {
    await releaseOutboundSend({
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      dailyCap: input.dailyCap ?? 1000,
    });
    return { allowed: false, reason: 'lifecycle occurrence is not dispatchable' };
  }

  return { allowed: true, claim: claim as OutboundClaim & { status: 'claimed' } };
}

/** Recheck directly before a provider call to close cancellation races. */
export async function recheckLifecycleSend(input: LifecycleSendGuardInput): Promise<boolean> {
  return lifecycleDispatchAllowed({ ...input, recipientHash: recipientHash(input.recipientEmail) });
}

export async function completeLifecycleSend(input: LifecycleSendGuardInput): Promise<void> {
  if (!(await completeLifecycleOccurrence({ ...input, recipientHash: recipientHash(input.recipientEmail) }))) return;
  await completeOutboundSend({
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
    dailyCap: input.dailyCap ?? 1000,
  });
}

export async function releaseLifecycleSend(input: LifecycleSendGuardInput): Promise<void> {
  await releaseOutboundSend({
    tenantId: input.tenantId,
    idempotencyKey: input.idempotencyKey,
    dailyCap: input.dailyCap ?? 1000,
  });
}

export async function markLifecycleSendUnknown(
  input: LifecycleSendGuardInput,
  reason: string
): Promise<void> {
  await markLifecycleReconciliation({ ...input, recipientHash: recipientHash(input.recipientEmail) }, reason);
  await markOutboundSendUnknown(
    {
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      dailyCap: input.dailyCap ?? 1000,
    },
    reason
  );
}
