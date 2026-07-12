import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  claimFollowUpSchedule,
  claimOutboundSend,
  completeOutboundSend,
  markOutboundSendUnknown,
} from '../outboundSafety';

type Store = {
  values: Map<string, string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  setIfNotExists(key: string, value: string): Promise<boolean>;
  checkAndIncrementFloat(
    key: string,
    amount: number,
    cap: number
  ): Promise<{ allowed: boolean; newValue: number }>;
  del(key: string): Promise<void>;
};

function createStore(): Store {
  const values = new Map<string, string>();
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async setIfNotExists(key, value) {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    async checkAndIncrementFloat(key, amount, cap) {
      const next = Number(values.get(key) ?? '0') + amount;
      if (next > cap) return { allowed: false, newValue: Number(values.get(key) ?? '0') };
      values.set(key, String(next));
      return { allowed: true, newValue: next };
    },
    async del(key) {
      values.delete(key);
    },
  };
}

let store: Store = createStore();

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn(async () => store),
}));

describe('Wave 9A outbound safety', () => {
  beforeEach(() => {
    store = createStore();
    delete process.env.OUTBOUND_DELIVERY_ENABLED;
  });

  it('fails closed until outbound delivery is explicitly enabled', async () => {
    await expect(
      claimOutboundSend({
        tenantId: 'tenant-a',
        idempotencyKey: 'outreach:lead-a:initial',
        dailyCap: 1,
      })
    ).resolves.toMatchObject({ status: 'unavailable' });
  });

  it('prevents a duplicate send after provider success', async () => {
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    const input = {
      tenantId: 'tenant-a',
      idempotencyKey: 'outreach:lead-a:initial',
      dailyCap: 1,
    };

    expect(await claimOutboundSend(input)).toMatchObject({ status: 'claimed' });
    await completeOutboundSend(input);

    expect(await claimOutboundSend(input)).toMatchObject({ status: 'duplicate' });
  });

  it('does not retry an ambiguous provider outcome automatically', async () => {
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    const input = {
      tenantId: 'tenant-a',
      idempotencyKey: 'outreach:lead-a:initial',
      dailyCap: 1,
    };

    expect(await claimOutboundSend(input)).toMatchObject({ status: 'claimed' });
    await markOutboundSendUnknown(input, 'provider timeout');

    expect(await claimOutboundSend(input)).toMatchObject({ status: 'reconciliation_required' });
  });

  it('enforces the tenant daily cap through the shared store', async () => {
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';

    expect(
      await claimOutboundSend({
        tenantId: 'tenant-a',
        idempotencyKey: 'outreach:lead-a:initial',
        dailyCap: 1,
      })
    ).toMatchObject({ status: 'claimed' });

    expect(
      await claimOutboundSend({
        tenantId: 'tenant-a',
        idempotencyKey: 'outreach:lead-b:initial',
        dailyCap: 1,
      })
    ).toMatchObject({ status: 'cap_reached' });
  });

  it('claims each follow-up sequence position only once', async () => {
    expect(await claimFollowUpSchedule('tenant-a', 'initial-a', 1)).toBe(true);
    expect(await claimFollowUpSchedule('tenant-a', 'initial-a', 1)).toBe(false);
    expect(await claimFollowUpSchedule('tenant-a', 'initial-a', 2)).toBe(true);
  });
});
