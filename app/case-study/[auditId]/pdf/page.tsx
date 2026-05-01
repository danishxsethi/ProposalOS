import { notFound } from 'next/navigation';

import CaseStudyTemplate from '@/components/CaseStudyTemplate';
import { getBranding } from '@/lib/config/branding';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';
import './pdf.css';

export const metadata = {
  robots: 'noindex, nofollow',
};

interface Props {
  params: Promise<{ auditId: string }>;
}

export default async function CaseStudyPdfPage({ params }: Props) {
  const { auditId } = await params;

  // Case-study PDF generation loads the tenant from the audit itself before fetching branding.
  const audit = await runWithTenantBypass('public-pdf-pre-auth:case-study-bootstrap', () =>
    prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        findings: { where: { excluded: false }, orderBy: { impactScore: 'desc' } },
        proposals: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    })
  );

  if (!audit) {
    notFound();
  }

  const proposal = audit.proposals[0] ?? null;
  const branding = await runWithTenantAsync(audit.tenantId, () => getBranding(audit.tenantId));

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
