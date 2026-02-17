import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { getBranding } from '@/lib/config/branding';
import CaseStudyTemplate from '@/components/case-study-template';
import './pdf.css';

export const metadata = {
    robots: 'noindex, nofollow',
};

interface Props {
    params: Promise<{ auditId: string }>;
}

export default async function CaseStudyPdfPage({ params }: Props) {
    const { auditId } = await params;

    const audit = await prisma.audit.findUnique({
        where: { id: auditId },
        include: {
            findings: { where: { excluded: false }, orderBy: { impactScore: 'desc' } },
            proposals: { take: 1, orderBy: { createdAt: 'desc' } },
        },
    });

    if (!audit) {
        notFound();
    }

    const proposal = audit.proposals[0] ?? null;
    const branding = await getBranding(audit.tenantId);

    return (
        <CaseStudyTemplate
                audit={{
                    businessName: audit.businessName,
                    businessCity: audit.businessCity,
                    businessIndustry: audit.businessIndustry,
                    findings: audit.findings,
                }}
                proposal={
                    proposal
                        ? {
                              executiveSummary: proposal.executiveSummary,
                              painClusters: proposal.painClusters,
                              webLinkToken: proposal.webLinkToken,
                          }
                        : null
                }
                branding={branding}
            />
    );
}
