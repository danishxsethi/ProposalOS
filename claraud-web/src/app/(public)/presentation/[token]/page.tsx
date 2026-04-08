import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PresentationViewer from "@/components/proposals/PresentationViewer";

export default async function PresentationPage({ params }: { params: { token: string } }) {
    const { token } = await params;

    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
            audit: {
                include: { findings: { orderBy: { impactScore: 'desc' }, take: 5 } }
            },
            template: true
        }
    });

    if (!proposal) {
        notFound();
    }

    // Record view anonymously in background (production would use a client-side beacon)
    await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
            viewedAt: new Date(),
            shareCount: { increment: 1 }
        }
    });

    const tenantBranding = await prisma.tenantBranding.findUnique({
        where: { tenantId: proposal.tenantId }
    });

    return (
        <PresentationViewer
            proposal={proposal as any}
            branding={tenantBranding as any}
        />
    );
}
