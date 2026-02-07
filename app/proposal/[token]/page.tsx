import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import './print.css';
import ProposalPage from './ProposalPage';

interface Props {
    params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { token } = await params;
    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: { audit: true },
    });

    if (!proposal) {
        return { title: 'Proposal Not Found' };
    }

    return {
        title: `Proposal for ${proposal.audit.businessName}`,
        description: proposal.executiveSummary?.slice(0, 160) || 'Your custom business proposal',
    };
}

export default async function Page({ params }: Props) {
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
                },
            },
        },
    });

    if (!proposal) {
        notFound();
    }

    // Track view (only first time)
    if (!proposal.viewedAt) {
        await prisma.proposal.update({
            where: { id: proposal.id },
            data: { viewedAt: new Date(), status: 'VIEWED' },
        });
    }

    return <ProposalPage proposal={proposal} />;
}
