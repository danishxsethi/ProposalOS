import { prisma } from '@/lib/prisma';
import Link from 'next/link';

// Server Component
export default async function TenantsPage() {
    const tenants = await prisma.tenant.findMany({
        include: {
            _count: {
                select: { audits: true, users: true }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">Tenant Management</h1>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4">Tenant Name</th>
                            <th className="p-4">Plan</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Audits</th>
                            <th className="p-4">Users</th>
                            <th className="p-4">Created</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tenants.map((t) => (
                            <tr key={t.id} className="border-t border-slate-800 hover:bg-slate-800/50 transition">
                                <td className="p-4 py-3 font-medium text-white">{t.name}</td>
                                <td className="p-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${t.planTier === 'agency' ? 'bg-purple-500/10 text-purple-400' :
                                            t.planTier === 'pro' ? 'bg-blue-500/10 text-blue-400' :
                                                'bg-slate-700/50 text-slate-400'
                                        }`}>
                                        {t.planTier}
                                    </span>
                                </td>
                                <td className="p-4 py-3">
                                    {t.isActive ? (
                                        <span className="text-green-400">Active</span>
                                    ) : (
                                        <span className="text-red-400">Suspended</span>
                                    )}
                                </td>
                                <td className="p-4 py-3">{t._count.audits}</td>
                                <td className="p-4 py-3">{t._count.users}</td>
                                <td className="p-4 py-3">{new Date(t.createdAt).toLocaleDateString()}</td>
                                <td className="p-4 py-3 flex gap-2">
                                    <button className="text-indigo-400 hover:text-white px-2 py-1 bg-indigo-500/10 rounded">Edit</button>
                                    <button className="text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded" title="Impersonate">👻</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
