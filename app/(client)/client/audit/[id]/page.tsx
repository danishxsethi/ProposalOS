import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';

export default async function ClientAuditPage({
    params,
    searchParams
}: {
    params: { id: string },
    searchParams: { token?: string }
}) {
    const token = searchParams.token;
    if (!token) return redirect('/login');

    const audit = await prisma.audit.findUnique({
        where: { id: params.id },
        include: {
            findings: true
        }
    });

    if (!audit) return notFound();

    // Fetch Statuses
    const statuses = await prisma.findingStatus.findMany({
        where: { auditId: audit.id }
    });

    const statusMap = new Map(statuses.map(s => [s.findingId, s.status]));

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
                <a href={`/client/dashboard?token=${token}`} className="text-slate-400 hover:text-indigo-600">← Dashboard</a>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Live Fix Tracker</h1>

            <div className="space-y-4">
                {audit.findings.map(finding => {
                    const status = statusMap.get(finding.id) || 'not_started';
                    return (
                        <div key={finding.id} className={`bg-white border p-6 rounded-xl flex justify-between items-start ${status === 'fixed' ? 'border-green-200 bg-green-50/30' : 'border-slate-200'
                            }`}>
                            <div className="max-w-xl">
                                <div className="flex items-center gap-3 mb-2">
                                    <Badge type={finding.type} />
                                    <h3 className={`font-bold text-lg ${status === 'fixed' ? 'text-green-800 line-through decoration-green-800/30' : 'text-slate-800'}`}>
                                        {finding.title}
                                    </h3>
                                </div>
                                <p className="text-slate-600 text-sm mb-4">{finding.description}</p>

                                {finding.recommendedFix && (
                                    <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded">
                                        <strong>Planned Fix:</strong> {JSON.parse(JSON.stringify(finding.recommendedFix))[0]}
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0">
                                <StatusBadge status={status} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Badge({ type }: { type: string }) {
    if (type === 'PAINKILLER') return <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Critical</span>;
    return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Optimization</span>;
}

function StatusBadge({ status }: { status: string }) {
    if (status === 'fixed') return (
        <span className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold uppercase shadow-sm">
            <span>✓</span> Fixed
        </span>
    );
    if (status === 'in_progress') return (
        <span className="flex items-center gap-1.5 bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full text-xs font-bold uppercase shadow-sm animate-pulse">
            <span>⚙️</span> Working
        </span>
    );
    return (
        <span className="flex items-center gap-1.5 bg-slate-100 text-slate-500 px-3 py-1.5 rounded-full text-xs font-bold uppercase">
            Waiting
        </span>
    );
}
