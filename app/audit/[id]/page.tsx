import { notFound, redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

import AuditDetailClient from './AuditDetailClient';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AuditDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const tenantId =
    session?.user && 'tenantId' in session.user
      ? (session.user as { tenantId?: string }).tenantId
      : undefined;

  if (!tenantId) {
    redirect('/login');
  }

  const audit = await runWithTenantAsync(tenantId, () =>
    prisma.audit.findUnique({
      where: { id },
      include: {
        findings: {
          orderBy: { impactScore: 'desc' },
        },
        proposals: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
  );

  if (!audit) {
    notFound();
  }

  return <AuditDetailClient audit={audit} />;
}
