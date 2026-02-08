import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function AuditBrowserPage() {
    const audits = await prisma.audit.findMany({
        include: {
            tenant: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">Global Audit Browser</h1>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Business</th>
                            <th className="p-4">Tenant</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Score</th>
                            <th className="p-4">Modules</th>
                            <th className="p-4">Link</th>
                        </tr>
                    </thead>
                    <tbody>
                        {audits.map((a) => (
                            <tr key={a.id} className="border-t border-slate-800 hover:bg-slate-800/50 transition">
                                <td className="p-4 py-3">{new Date(a.createdAt).toLocaleString()}</td>
                                <td className="p-4 py-3">
                                    <div className="font-medium text-white">{a.businessName}</div>
                                    <div className="text-xs truncate max-w-[200px] opacity-50">{a.businessUrl}</div>
                                </td>
                                <td className="p-4 py-3">{a.tenant.name}</td>
                                <td className="p-4 py-3 uppercase text-xs font-bold">
                                    <span className={a.status === 'COMPLETE' ? 'text-green-400' : 'text-slate-500'}>
                                        {a.status}
                                    </span>
                                </td>
                                <td className="p-4 py-3 font-mono text-white text-base">
                                    {a.overallScore || '-'}
                                </td>
                                <td className="p-4 py-3 text-xs">
                                    {a.modulesFailed && JSON.parse(JSON.stringify(a.modulesFailed)).length > 0 ? (
                                        <span className="text-red-400">{JSON.parse(JSON.stringify(a.modulesFailed)).length} Failed</span>
                                    ) : (
                                        <span className="text-green-500/50">All OK</span>
                                    )}
                                </td>
                                <td className="p-4 py-3">
                                    <Link href={`/proposal/preview/${a.id}`} target="_blank" className="text-indigo-400 hover:underline">
                                        View
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
