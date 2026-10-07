import { describe, expect, it } from 'vitest';

import { apiKeyCanAccessTenant } from '@/lib/auth/apiKeys';

describe('tenant API-key authority', () => {
  it('keeps wildcard permission scoped to the issuing tenant', () => {
    const principal = { tenantId: 'tenant-a' };
    expect(apiKeyCanAccessTenant(principal, 'tenant-a')).toBe(true);
    expect(apiKeyCanAccessTenant(principal, 'tenant-b')).toBe(false);
  });
});
