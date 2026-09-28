import { describe, expect, it, vi } from 'vitest';

import { outboundMode } from '@/lib/outreach/outboundDelivery';

describe('outbound delivery activation policy', () => {
  it('is disabled unless all explicit live gates are set', () => {
    const keys = ['OUTBOUND_MODE', 'OUTBOUND_DELIVERY_ENABLED', 'OUTREACH_LIVE_SENDING'] as const;
    const previous = keys.map((key) => process.env[key]);
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      for (const key of keys) delete process.env[key];
      expect(outboundMode()).toBe('disabled');
      process.env.OUTBOUND_MODE = 'live';
      process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
      expect(outboundMode()).toBe('disabled');
      process.env.OUTREACH_LIVE_SENDING = 'true';
      expect(outboundMode()).toBe('live');
    } finally {
      keys.forEach((key, index) => {
        const value = previous[index];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      });
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
