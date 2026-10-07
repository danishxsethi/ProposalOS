import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync } from '@/lib/tenant/context';

import { AppShell } from './components/AppShell';

/**
 * Authenticated application shell: primary navigation, settings sub-nav,
 * skip link and a single <main> landmark. Every (dashboard) route renders
 * inside this so no authenticated page is a dead end.
 */
export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const tenantId =
    session?.user && 'tenantId' in session.user
      ? (session.user as { tenantId?: string }).tenantId
      : undefined;

  if (!session?.user || !tenantId) {
    redirect('/login');
  }

  const tenant = await runWithTenantAsync(tenantId, () =>
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
  );

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }} tenantName={tenant?.name ?? 'Workspace'}>
      {children}
    </AppShell>
  );
}
