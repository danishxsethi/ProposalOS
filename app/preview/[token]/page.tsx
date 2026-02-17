import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ProposalPage from '../../proposal/[token]/ProposalPage';
import { getBranding } from '@/lib/config/branding';

interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function PreviewPage({ params }: PageProps) {
    const { token } = await params;

    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
            audit: {
                include: {
                    findings: {
                        where: { excluded: false },
                        orderBy: { impactScore: 'desc' },
                    },
                    evidence: true,
                },
            },
            template: true,
        },
    });

    if (!proposal) {
        notFound();
    }

    const branding = await getBranding(proposal.tenantId);

    return (
        <>
            {/* Preview Banner */}
            <div className="bg-yellow-500/10 border-b border-yellow-500/20 sticky top-0 z-50">
                <div className="container mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">👀</span>
                            <div>
                                <p className="text-sm font-medium text-yellow-200">
                                    Preview Mode
                                </p>
                                <p className="text-xs text-yellow-300/70">
                                    This is how the client will see the proposal
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <a
                                href="/dashboard"
                                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
                            >
                                Back to Dashboard
                            </a>
                            <a
                                href={`/proposal/${token}`}
                                target="_blank"
                                className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium"
                            >
                                Open Live Version
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actual Proposal Content */}
            <ProposalPage proposal={proposal} branding={branding} />
        </>
    );
}
