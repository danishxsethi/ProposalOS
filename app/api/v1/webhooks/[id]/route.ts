/**
 * DELETE /api/v1/webhooks/:id — Remove a webhook endpoint
 * Requirements: 9.4
 */

import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/platform/api/middleware';
import { deleteWebhook } from '@/lib/platform/api/webhooks';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  if (!auth.permissions.includes('write') && !auth.permissions.includes('admin')) {
    return NextResponse.json({ error: 'Forbidden', message: 'write permission required' }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await deleteWebhook(id, auth.tenantId);

  if (!deleted) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
