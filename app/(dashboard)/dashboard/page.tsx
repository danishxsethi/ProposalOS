import Link from 'next/link';

import DashboardClient from '@/app/dashboard/DashboardClient';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function DashboardPage() {
  const session = await auth();
  const tenantId =
    session?.user && 'tenantId' in session.user
      ? (session.user as { tenantId?: string }).tenantId
      : undefined;
  if (!tenantId) {
    return <div className="p-8 text-white">Auth required</div>;
  }

  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { currentPeriodEnd: 'desc' },
    }),
  ]);

  const isPastDue = tenant?.subscriptionStatus === 'past_due';
  const graceEndsAt = subscription
    ? new Date(subscription.currentPeriodEnd.getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;
  const graceExpired = Boolean(isPastDue && graceEndsAt && graceEndsAt.getTime() < Date.now());

  return (
    <div className="space-y-6">
      {tenant && !tenant.onboardingCompletedAt && (
        <div className="mx-auto max-w-6xl rounded-xl border border-blue-500/30 bg-blue-500/10 px-6 py-4 text-sm text-blue-100">
          Finish your setup in the{' '}
          <Link href="/onboarding" className="font-semibold underline">
            onboarding wizard
          </Link>{' '}
          to connect accounts, brand your workspace, and run your first audit.
        </div>
      )}

      {isPastDue && !graceExpired && graceEndsAt && (
        <div className="mx-auto max-w-6xl rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-4 text-sm text-amber-100">
          Your latest payment failed. You still have access until {graceEndsAt.toLocaleDateString()}
          . Update billing in{' '}
          <Link href="/settings/billing" className="font-semibold underline">
            Billing Settings
          </Link>
          .
        </div>
      )}

      {graceExpired && (
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-white">
          <h1 className="mb-3 text-2xl font-bold">Billing needs attention</h1>
          <p className="mb-6 text-white/75">
            Your 7-day grace period has ended. Restore access by updating your payment method in the
            Stripe customer portal.
          </p>
          <Link
            href="/settings/billing"
            className="inline-flex rounded-lg bg-white px-5 py-3 font-semibold text-slate-900"
          >
            Open Billing Settings
          </Link>
        </div>
      )}

      {!graceExpired && <DashboardClient />}
    </div>
  );
}
