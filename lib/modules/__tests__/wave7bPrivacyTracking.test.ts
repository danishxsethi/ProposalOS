import { describe, expect, it } from 'vitest';

import { isKnownTrackingCookie } from '../privacyCompliance';

describe('privacyCompliance tracker detection (P2-50)', () => {
  it.each([
    '_ga_ABC123',
    '_hjSession_123',
    'li_sugr',
    '_ttp',
    '_clck',
    'hubspotutk',
    'mp_123_mixpanel',
  ])('recognizes the known tracker cookie %s', (cookieName) => {
    expect(isKnownTrackingCookie(cookieName)).toBe(true);
  });

  it('does not classify an unrelated first-party cookie as a tracker', () => {
    expect(isKnownTrackingCookie('customer_portal_session')).toBe(false);
  });
});
