import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getUsageStats } from '@/lib/billing/metering';

export default async function BillingPage() {
    const session = await auth();
    const tenantId = session?.user && 'tenantId' in session.user ? (session.user as { tenantId?: string }).tenantId : undefined;
    if (!tenantId) return <div>Auth required</div>;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
    });

    if (!tenant) return <div>Tenant not found</div>;

    const usage = await getUsageStats(tenant.id);

    // Limits logic (duplicate from lib, ideally shared const)
    let limit = 10;
    let price = 0;
    let overageCost = 0;

    if (tenant.planTier === 'starter') { limit = 25; price = 99; overageCost = 4; }
    if (tenant.planTier === 'pro') { limit = 100; price = 299; overageCost = 3; }
    if (tenant.planTier === 'agency') { limit = 999999; price = 599; overageCost = 0; }

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
                            <div className="text-slate-400 text-sm font-bold uppercase tracking-wider">Current Plan</div>
                            <div className="text-3xl font-black text-white capitalize">{tenant.planTier}</div>
                            <div className="text-slate-400">${price}/mo</div>
                        </div>
                        <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-bold text-sm">
                            Manage Subscription
                        </button>
                    </div>
                </div>

                {/* USAGE */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <div className="flex justify-between items-end mb-4">
                        <div>
                            <div className="text-slate-400 text-sm font-bold uppercase tracking-wider">Audit Usage</div>
                            <div className="text-3xl font-black text-white">
                                {usage} <span className="text-lg text-slate-500 font-normal">/ {limit === 999999 ? '∞' : limit}</span>
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
                            : `Resets on 1st of month.`
                        }
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
                            <tr className="border-t border-slate-800">
                                <td className="p-4">Nov 1, 2025</td>
                                <td className="p-4">$99.00</td>
                                <td className="p-4 text-green-400">Paid</td>
                                <td className="p-4"><a href="#" className="hover:text-white">Download</a></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
