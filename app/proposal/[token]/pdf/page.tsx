import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getBranding } from '@/lib/config/branding';
import PdfTemplate from '@/components/PdfTemplate';
import './pdf-print.css';

export const metadata = {
    robots: 'noindex, nofollow',
};

interface Props {
    params: Promise<{ token: string }>;
}

export default async function PdfPage({ params }: Props) {
    const { token } = await params;

    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: token },
        include: {
            audit: {
                include: { findings: true },
            },
        },
    });

    if (!proposal) {
        notFound();
    }

    const branding = await getBranding(proposal.tenantId);

    return (
        <div className="pdf-root" data-pdf-ready>
            <PdfTemplate proposal={proposal} branding={branding} />
        </div>
    );
}
