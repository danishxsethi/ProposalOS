import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertLiveProviderReady,
  getMailboxDailyCap,
  getOutreachProviderName,
  outreachSendingEnabled,
} from '../providers';

describe('outreach provider selection and delivery gates', () => {
  beforeEach(() => {
    delete process.env.OUTREACH_PROVIDER;
    delete process.env.OUTREACH_LIVE_SENDING;
    delete process.env.OUTBOUND_DELIVERY_ENABLED;
    delete process.env.OUTREACH_MAILBOX_DAILY_CAP;
  });

  it('defaults to Resend without enabling delivery', () => {
    expect(getOutreachProviderName()).toBe('resend');
    expect(outreachSendingEnabled()).toBe(false);
    expect(() => assertLiveProviderReady()).toThrow(/Outbound delivery refused/);
  });

  it('selects Zoho SMTP only when explicitly configured', () => {
    process.env.OUTREACH_PROVIDER = 'zoho_smtp';
    expect(getOutreachProviderName()).toBe('zoho_smtp');
  });

  it('requires both independent live-send flags', () => {
    process.env.OUTREACH_LIVE_SENDING = 'true';
    expect(outreachSendingEnabled()).toBe(false);
    process.env.OUTBOUND_DELIVERY_ENABLED = 'true';
    expect(outreachSendingEnabled()).toBe(true);
    expect(() => assertLiveProviderReady()).not.toThrow();
  });

  it('clamps mailbox caps to the conservative 30-40/day range', () => {
    process.env.OUTREACH_MAILBOX_DAILY_CAP = '100';
    expect(getMailboxDailyCap()).toBe(40);
    process.env.OUTREACH_MAILBOX_DAILY_CAP = '35';
    expect(getMailboxDailyCap()).toBe(35);
    process.env.OUTREACH_MAILBOX_DAILY_CAP = '-1';
    expect(getMailboxDailyCap()).toBe(35);
  });
});
