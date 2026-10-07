import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/middleware/auth';
import { getProtectedObjectUrl, parseStorageReference } from '@/lib/storage';
import { getTenantId } from '@/lib/tenant/context';

const PRIVATE_PREFIXES = new Set([
  'audit-snapshots',
  'delivery-bundles',
  'proposals',
  'screenshots',
]);

export const GET = withAuth(async (req: Request) => {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reference = new URL(req.url).searchParams.get('ref');
  if (!reference) return NextResponse.json({ error: 'Missing storage reference' }, { status: 400 });

  try {
    const { key } = parseStorageReference(reference);
    const [prefix, objectTenantId] = key.split('/', 3);
    if (!prefix || !PRIVATE_PREFIXES.has(prefix) || objectTenantId !== tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const signedUrl = await getProtectedObjectUrl(reference, 300);
    const response = NextResponse.redirect(signedUrl, 302);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
});
