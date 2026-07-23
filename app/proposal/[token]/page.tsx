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

function extractScoresForMeta(findings: { metrics?: unknown }[]): { performance: number; seo: number } {
    let p = 0, s = 0, pC = 0, sC = 0;
    for (const f of findings) {
        const m = (f.metrics || {}) as Record<string, number>;
        if (typeof m.performanceScore === 'number') { p += m.performanceScore; pC++; }
        if (typeof m.seoScore === 'number') { s += m.seoScore; sC++; }
    }
    return {
        performance: pC ? Math.round(p / pC) : 0,
        seo: sC ? Math.round(s / sC) : 0,
    };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { token } = await params;
    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: { audit: { include: { findings: true } } },
    });

    if (!proposal) {
        return { title: 'Proposal Not Found' };
    }

    const branding = await getBranding(proposal.tenantId);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://proposalengine.com';
    const shareUrl = `${baseUrl}/proposal/${token}`;

    const scores = extractScoresForMeta(proposal.audit.findings);
    const findingsCount = proposal.audit.findings.length;

    const ogTitle = `Website Audit for ${proposal.audit.businessName}`;
    const ogDescription = `Performance: ${scores.performance}/100 | SEO: ${scores.seo}/100 | ${findingsCount} opportunities found`;

    const ogImages = branding.logoUrl
        ? [{ url: branding.logoUrl, width: 1200, height: 630, alt: `${branding.name} Logo` }]
        : [];

    return {
        title: ogTitle,
        description: ogDescription,
        icons: branding.logoUrl ? { icon: branding.logoUrl } : undefined,

        openGraph: {
            title: ogTitle,
            description: ogDescription,
            url: shareUrl,
            siteName: branding.name,
            type: 'website',
            images: ogImages,
        },

        twitter: {
            card: ogImages.length ? 'summary_large_image' : 'summary',
            title: ogTitle,
            description: ogDescription,
            images: branding.logoUrl ? [branding.logoUrl] : [],
        },
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

    return <ProposalPage proposal={proposal} branding={branding} />;
}
