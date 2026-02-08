import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';

export default async function ClientPlanPage({ searchParams }: { searchParams: { token?: string } }) {
    const token = searchParams.token;
    if (!token) return redirect('/login');

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
                <a href={`/client/dashboard?token=${token}`} className="text-slate-400 hover:text-indigo-600">← Dashboard</a>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Implementation Timeline</h1>

            <div className="relative border-l-2 border-slate-200 ml-4 space-y-12">
                <TimelineItem
                    phase="Phase 1: Foundation"
                    date="Week 1-2"
                    status="complete"
                    items={[
                        "Audit & Strategy Session",
                        "Google Business Profile Optimization",
                        "Website Speed Fixes"
                    ]}
                />
                <TimelineItem
                    phase="Phase 2: Growth"
                    date="Week 3-6"
                    status="current"
                    items={[
                        "Content Creation (4 Blog Posts)",
                        "Reputation Management Campaign",
                        "Social Media Launch"
                    ]}
                />
                <TimelineItem
                    phase="Phase 3: Scale"
                    date="Week 7+"
                    status="future"
                    items={[
                        "Paid Ads Setup",
                        "Advanced Analytics",
                        "Quarterly Review"
                    ]}
                />
            </div>
        </div>
    );
}

function TimelineItem({ phase, date, status, items }: any) {
    const color = status === 'complete' ? 'bg-green-500' : status === 'current' ? 'bg-indigo-600' : 'bg-slate-300';
    return (
        <div className="relative pl-8">
            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white ${color}`} />
            <div className="font-bold text-lg text-slate-800 mb-1">{phase} <span className="text-sm font-normal text-slate-500 ml-2">({date})</span></div>
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <ul className="space-y-3">
                    {items.map((item: string, i: number) => (
                        <li key={i} className="flex items-center gap-3 text-slate-600">
                            {status === 'complete' ? <span className="text-green-500">✓</span> : <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />}
                            <span className={status === 'complete' ? 'line-through text-slate-400' : ''}>{item}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
