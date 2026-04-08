import { auth } from '@/lib/auth';
import { getUsageStats } from '@/lib/billing/metering';
import { prisma } from '@/lib/prisma';

import ManageSubscriptionButton from './ManageSubscriptionButton';

export default async function BillingPage() {
  const session = await auth();
  const tenantId =
    session?.user && 'tenantId' in session.user
      ? (session.user as { tenantId?: string }).tenantId
      : undefined;
  if (!tenantId) return <div>Auth required</div>;

  const [tenant, subscription, payments] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { currentPeriodEnd: 'desc' },
    }),
    prisma.payment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  if (!tenant) return <div>Tenant not found</div>;

  const usage = await getUsageStats(tenant.id);

  // Limits logic (duplicate from lib, ideally shared const)
  let limit = 10;
  let price = 0;
  let overageCost = 0;

  if (tenant.planTier === 'starter') {
    limit = 25;
    price = 99;
    overageCost = 4;
  }
  if (tenant.planTier === 'pro') {
    limit = 100;
    price = 299;
    overageCost = 3;
  }
  if (tenant.planTier === 'agency') {
    limit = 999999;
    price = 599;
    overageCost = 0;
  }

  const percent = Math.min((usage / limit) * 100, 100);
  const overageCount = Math.max(0, usage - limit);
  const estimatedOverageBill = overageCount * overageCost;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-white mb-2">Billing & Usage</h1>
      <p className="text-slate-400 mb-8">Manage your subscription and view usage.</p>

      <div className="grid gap-8 md:grid-cols-2">
        {/* CURRENT PLAN */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="text-slate-400 text-sm font-bold uppercase tracking-wider">
                Current Plan
              </div>
              <div className="text-3xl font-black text-white capitalize">{tenant.planTier}</div>
              <div className="text-slate-400">${price}/mo</div>
              <div className="text-xs text-slate-500 mt-2">
                Billing status: <span className="capitalize">{tenant.subscriptionStatus}</span>
                {subscription && (
                  <> • Next billing date {subscription.currentPeriodEnd.toLocaleDateString()}</>
                )}
              </div>
            </div>
            <ManageSubscriptionButton />
          </div>
        </div>

        {/* USAGE */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-slate-400 text-sm font-bold uppercase tracking-wider">
                Audit Usage
              </div>
              <div className="text-3xl font-black text-white">
                {usage}{' '}
                <span className="text-lg text-slate-500 font-normal">
                  / {limit === 999999 ? '∞' : limit}
                </span>
              </div>
            </div>
            {overageCount > 0 && (
              <div className="text-right">
                <div className="text-xs text-orange-400 font-bold uppercase">Overage</div>
                <div className="text-xl font-bold text-white">+${estimatedOverageBill}</div>
              </div>
            )}
          </div>

          <div className="w-full bg-slate-800 h-4 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full ${overageCount > 0 ? 'bg-orange-500' : 'bg-indigo-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="text-xs text-slate-500">
            {overageCount > 0
              ? `You are ${overageCount} audits over your limit. Overage charged at $${overageCost}/audit.`
              : `Resets on 1st of month.`}
          </p>
        </div>
      </div>

      {/* INVOICE HISTORY TABLE PLACEHOLDER */}
      <div className="mt-12">
        <h2 className="text-xl font-bold text-white mb-4">Invoice History</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-950 text-slate-500 font-bold uppercase text-xs">
              <tr>
                <th className="p-4">Date</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr className="border-t border-slate-800">
                  <td className="p-4 text-slate-500" colSpan={4}>
                    No invoices yet.
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-slate-800">
                    <td className="p-4">{payment.createdAt.toLocaleDateString()}</td>
                    <td className="p-4">${(payment.amountCents / 100).toFixed(2)}</td>
                    <td
                      className={`p-4 ${payment.status === 'paid' ? 'text-green-400' : 'text-amber-400'}`}
                    >
                      {payment.status}
                    </td>
                    <td className="p-4 text-slate-500">{payment.stripeInvoiceId ?? 'N/A'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
