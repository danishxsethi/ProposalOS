import { notFound } from 'next/navigation';

import CaseStudyTemplate from '@/components/CaseStudyTemplate';
import { getServerSession } from '@/lib/auth';
import { getBranding } from '@/lib/config/branding';
import { prisma } from '@/lib/prisma';
import { validateCaseStudyAccess } from '@/lib/security/caseStudyAuth';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';
import './pdf.css';

export const metadata = {
  robots: 'noindex, nofollow',
};

interface Props {
  params: Promise<{ auditId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CaseStudyPdfPage({ params, searchParams }: Props) {
  const { auditId } = await params;
  const resolvedSearchParams = await searchParams;
  const rawToken = resolvedSearchParams.token;
  const token = typeof rawToken === 'string' ? rawToken : null;

  // Get current user session if any
  const session = await getServerSession();
  const sessionTenantId = session?.user?.tenantId ?? null;

  // Authenticate and authorize case study access
  const authResult = await validateCaseStudyAccess(auditId, token, sessionTenantId);

  if (!authResult.authorized) {
    notFound();
  }

  // Load the audit under bypass since it's already verified and tenant is resolved.
  const audit = await runWithTenantBypass('public-pdf-authorized:case-study-bootstrap', () =>
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
