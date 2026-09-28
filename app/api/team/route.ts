import { NextResponse } from 'next/server';

import { generateTraceId } from '@/lib/api/errors';
import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';

/**
 * GET /api/team
 * Tenant-scoped list of workspace members and pending invitations.
 * Runs inside the tenant context established by withAuth (RLS-enforced).
 */
export const GET = withAuth(async () => {
  const traceId = generateTraceId();
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized', traceId }, { status: 401 });

  const [members, invites] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true, emailVerified: true },
    }),
    prisma.invitation.findMany({
      where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  ]);

  return NextResponse.json(
    {
      team: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.emailVerified ? 'active' : 'unverified',
        joinedAt: m.createdAt,
      })),
      invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
    },
    { headers: { 'X-Trace-Id': traceId } }
  );
});
