import { notFound } from 'next/navigation';

import PdfTemplate from '@/components/PdfTemplate';
import { getBranding } from '@/lib/config/branding';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';
import './pdf-print.css';

export const metadata = {
  robots: 'noindex, nofollow',
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PdfPage({ params }: Props) {
  const { token } = await params;

  // PDF rendering is token-gated and needs one pre-tenant bootstrap read.
  const proposal = await runWithTenantBypass('magic-link-pre-auth:proposal-pdf-bootstrap', () =>
    prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: {
        audit: {
          include: { findings: true },
        },
      },
    })
  );

  if (!proposal) {
    notFound();
  }

  const branding = await runWithTenantAsync(proposal.tenantId, () =>
    getBranding(proposal.tenantId)
  );

  return (
    <div className="pdf-root" data-pdf-ready>
      <PdfTemplate proposal={proposal} branding={branding} />
    </div>
  );
}
