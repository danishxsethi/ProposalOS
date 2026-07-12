import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';

import { scheduleFollowUps } from '../outreach';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    outreachEmail: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

type Store = {
  values: Map<string, string>;
  setIfNotExists(key: string, value: string, ttl: number): Promise<boolean>;
  del(key: string): Promise<void>;
};

function createStore(): Store {
  const values = new Map<string, string>();
  return {
    values,
    async setIfNotExists(key, value) {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
    async del(key) {
      values.delete(key);
    },
  };
}

let store = createStore();

vi.mock('@/lib/store/shared', () => ({
  getSharedStore: vi.fn(async () => store),
}));

describe('Wave 9A follow-up scheduling', () => {
  beforeEach(() => {
    store = createStore();
    vi.clearAllMocks();
    vi.mocked(prisma.outreachEmail.findUnique).mockResolvedValue({
      tenantId: 'tenant-1',
      leadId: 'lead-1',
      sentAt: new Date('2026-07-01T12:00:00.000Z'),
      createdAt: new Date('2026-07-01T11:00:00.000Z'),
    } as any);
    vi.mocked(prisma.outreachEmail.create).mockResolvedValue({ id: 'follow-up' } as any);
  });

  it('persists scheduled due times and sequence positions', async () => {
    await scheduleFollowUps('lead-1', 'initial-1', [3, 7]);

    expect(prisma.outreachEmail.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: new Date('2026-07-04T12:00:00.000Z'),
          sequencePosition: 1,
        }),
      })
    );
    expect(prisma.outreachEmail.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: new Date('2026-07-08T12:00:00.000Z'),
          sequencePosition: 2,
        }),
      })
    );
  });

  it('does not create duplicate follow-ups on a replay', async () => {
    await scheduleFollowUps('lead-1', 'initial-1', [3, 7]);
    await scheduleFollowUps('lead-1', 'initial-1', [3, 7]);

    expect(prisma.outreachEmail.create).toHaveBeenCalledTimes(2);
  });
});
