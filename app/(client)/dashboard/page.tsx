import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ClientDashboard({
    searchParams
}: {
    searchParams: { token?: string }
}) {
    const token = searchParams.token;
    if (!token) return redirect('/login'); // Or show magic link request form

    // Verify Token (Linked to Proposal)
    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
            audit: true,
            acceptance: true
        }
    });

    if (!proposal || !proposal.audit) return notFound();

    // Calculate Fixed Issues (Progress)
    const fixedCount = await prisma.findingStatus.count({
        where: {
            auditId: proposal.auditId,
            status: 'fixed'
        }
    });

    const totalFindings = await prisma.finding.count({
        where: { auditId: proposal.auditId, type: 'PAINKILLER' } // Focus on Painkillers
    });

    const progress = totalFindings > 0 ? Math.round((fixedCount / totalFindings) * 100) : 0;

    return (
        <div className="max-w-5xl mx-auto">
            <header className="mb-8">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">
                            Hi, {proposal.audit.businessName}!
                        </h1>
                        <p className="text-slate-500">
                            Here is the live status of your digital growth plan.
                        </p>
                    </div>
                    {/* Status Card */}
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase">Overall Progress</div>
                        <div className="text-3xl font-black text-indigo-600">{progress}%</div>
                        <div className="text-xs text-slate-500">{fixedCount} of {totalFindings} Critical Issues Fixed</div>
                    </div>
                </div>
            </header>

            {/* Navigation GRID */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <DashboardCard
                    title="Audit Results"
                    desc="View findings and real-time fix status."
                    href={`/client/audit/${proposal.auditId}?token=${token}`}
                    icon="🔍"
                />
                <DashboardCard
                    title="Action Plan"
                    desc="Track the implementation timeline."
                    href={`/client/plan?token=${token}`}
                    icon="📅"
                />
                <DashboardCard
                    title="Review Responses"
                    desc="AI-drafted replies to your customers."
                    href={`/client/reviews?token=${token}`}
                    icon="💬"
                />
            </div>

            {/* Opportunity Highlight */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-8">
                <h2 className="text-xl font-bold text-indigo-900 mb-4">Current Focus</h2>
                <p className="text-indigo-800 mb-6">
                    We are currently working on fixing your <strong>Website Speed</strong> and <strong>Local SEO</strong>.
                    Expected completion: Friday.
                </p>
                <div className="w-full bg-indigo-200 h-3 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full transition-all duration-1000" style={{ width: '45%' }} />
                </div>
            </div>
        </div>
    );
}

function DashboardCard({ title, desc, href, icon }: { title: string, desc: string, href: string, icon: string }) {
    return (
        <Link href={href} className="group bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-md p-6 rounded-xl transition-all">
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300 origin-left">{icon}</div>
            <h3 className="font-bold text-slate-900 text-lg mb-2 group-hover:text-indigo-600">{title} &rarr;</h3>
            <p className="text-slate-500 text-sm">{desc}</p>
        </Link>
    );
}
