import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { getTenantId } from '@/lib/tenant/context';

/**
 * Returns the current tenant ID for API-key-authenticated requests.
 * Used by scripts (e.g. final-audit) to bootstrap when DEFAULT_TENANT_ID is not set.
 */
export const GET = withAuth(async () => {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 401 });
  }
  return NextResponse.json({ tenantId });
});
