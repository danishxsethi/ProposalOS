import { getSharedStore } from '@/lib/store/shared';

const LOCK_TTL_SECONDS = 5 * 60;
const SENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const UNKNOWN_TTL_SECONDS = 7 * 24 * 60 * 60;
const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;
const FOLLOW_UP_TTL_SECONDS = 45 * 24 * 60 * 60;

export interface OutboundSendInput {
  tenantId: string;
  idempotencyKey: string;
  dailyCap: number;
  capScope?: string;
  alreadySent?: number;
  now?: Date;
}

export type OutboundClaim =
  | { status: 'claimed' }
  | { status: 'unavailable'; reason: string }
  | { status: 'duplicate' }
  | { status: 'reconciliation_required' }
  | { status: 'in_progress' }
  | { status: 'cap_reached' };

function assertInput(input: OutboundSendInput): void {
  if (!input.tenantId || !input.idempotencyKey) {
    throw new Error('tenantId and idempotencyKey are required for outbound delivery');
  }
  if (!Number.isSafeInteger(input.dailyCap) || input.dailyCap <= 0) {
    throw new Error('dailyCap must be a positive integer');
  }
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function keys(input: OutboundSendInput) {
  const prefix = `outbound:${input.tenantId}:${input.idempotencyKey}`;
  return {
    lock: `${prefix}:lock`,
    sent: `${prefix}:sent`,
    unknown: `${prefix}:unknown`,
    cap: `outbound-cap:${input.tenantId}:${input.capScope ?? 'tenant'}:${dayKey(input.now ?? new Date())}`,
  };
}

export function outboundDeliveryEnabled(): boolean {
  return process.env.OUTBOUND_DELIVERY_ENABLED === 'true';
}

export async function claimOutboundSend(input: OutboundSendInput): Promise<OutboundClaim> {
  assertInput(input);
  if (!outboundDeliveryEnabled()) {
    return {
      status: 'unavailable',
      reason: 'OUTBOUND_DELIVERY_ENABLED must be true before any message can be sent',
    };
  }

  const store = await getSharedStore();
  const key = keys(input);

  if (await store.get(key.sent)) return { status: 'duplicate' };
  if (await store.get(key.unknown)) return { status: 'reconciliation_required' };
  if (!(await store.setIfNotExists(key.lock, '1', LOCK_TTL_SECONDS))) {
    return { status: 'in_progress' };
  }

  if (input.alreadySent && input.alreadySent > 0) {
    await store.setIfNotExists(key.cap, String(input.alreadySent), DAY_TTL_SECONDS);
  }
  const cap = await store.checkAndIncrementFloat(key.cap, 1, input.dailyCap, DAY_TTL_SECONDS);
  if (!cap.allowed) {
    await store.del(key.lock);
    return { status: 'cap_reached' };
  }

  return { status: 'claimed' };
}

export async function completeOutboundSend(input: OutboundSendInput): Promise<void> {
  assertInput(input);
  const store = await getSharedStore();
  const key = keys(input);
  await store.set(key.sent, '1', SENT_TTL_SECONDS);
  await store.del(key.lock);
}

export async function markOutboundSendUnknown(
  input: OutboundSendInput,
  reason: string
): Promise<void> {
  assertInput(input);
  const store = await getSharedStore();
  const key = keys(input);
  await store.set(key.unknown, reason || 'provider outcome is unknown', UNKNOWN_TTL_SECONDS);
  await store.del(key.lock);
}

export async function releaseOutboundSend(input: OutboundSendInput): Promise<void> {
  assertInput(input);
  const store = await getSharedStore();
  await store.del(keys(input).lock);
}

export async function claimFollowUpSchedule(
  tenantId: string,
  initialEmailId: string,
  sequencePosition: number
): Promise<boolean> {
  if (
    !tenantId ||
    !initialEmailId ||
    !Number.isSafeInteger(sequencePosition) ||
    sequencePosition < 1
  ) {
    throw new Error('tenantId, initialEmailId, and a positive sequencePosition are required');
  }
  const store = await getSharedStore();
  return store.setIfNotExists(
    `outbound-follow-up:${tenantId}:${initialEmailId}:${sequencePosition}`,
    '1',
    FOLLOW_UP_TTL_SECONDS
  );
}

export async function releaseFollowUpSchedule(
  tenantId: string,
  initialEmailId: string,
  sequencePosition: number
): Promise<void> {
  const store = await getSharedStore();
  await store.del(`outbound-follow-up:${tenantId}:${initialEmailId}:${sequencePosition}`);
}
