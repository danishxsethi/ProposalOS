import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import './print.css';
import ProposalPage from './ProposalPage';
import { sendProposalViewed } from '@/lib/notifications/email';
import { sendWebhook } from '@/lib/notifications/webhook';
import { getBranding } from '@/lib/config/branding';

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

    // Fetch branding to update title if needed, though usually standard is fine
    const branding = await getBranding(proposal.tenantId);

    const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://proposalengine.com'}/proposal/${token}`;
    const shareTitle = `${branding.name} Proposal for ${proposal.audit.businessName}`;
    const shareDescription = proposal.executiveSummary?.slice(0, 160) ||
        `Comprehensive digital marketing audit and growth proposal for ${proposal.audit.businessName}`;

    return {
        title: shareTitle,
        description: shareDescription,
        icons: branding.logoUrl ? { icon: branding.logoUrl } : undefined,

        // Open Graph Tags for Facebook, LinkedIn
        openGraph: {
            title: shareTitle,
            description: shareDescription,
            url: shareUrl,
            siteName: branding.name,
            type: 'website',
            images: branding.logoUrl ? [{
                url: branding.logoUrl,
                width: 1200,
                height: 630,
                alt: `${branding.name} Logo`
            }] : [],
        },

        // Twitter Card
        twitter: {
            card: 'summary_large_image',
            title: shareTitle,
            description: shareDescription,
            images: branding.logoUrl ? [branding.logoUrl] : [],
        }
    };
}

export default async function Page({ params }: Props) {
    const { token } = await params;

    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
            audit: {
                include: {
                    findings: true,
                    evidence: true // Include evidence for images
                }
            },
            template: true // Fetch template data
        }
    });

    if (!proposal) {
        return <div>Proposal not found</div>;
    }

    const branding = await getBranding(proposal.tenantId);

    // Track View
    if (proposal && !proposal.viewedAt) {
        // Trigger server-side tracking via a separate async call or direct prisma update if we were in server component.
        // We are in a server component (Page).
        // Best practice: Use a client effect or a Next.js middleware, but since this is a server page render, we can just update DB directly!
        // CAUTION: This means every refresh triggers DB write.
        // Better: Only if viewedAt is null.
        // Also trigger Scheduler.

        await prisma.proposal.update({
            where: { id: proposal.id },
            data: { viewedAt: new Date(), status: 'VIEWED' },
        });

        // Send notifications
        sendProposalViewed(proposal.id, proposal.audit.businessName, new Date()).catch(console.error);
        sendWebhook('proposal.viewed', {
            proposalId: proposal.id,
            businessName: proposal.audit.businessName,
            viewedAt: new Date()
        });
    }

    return <ProposalPage proposal={proposal} />;
}
