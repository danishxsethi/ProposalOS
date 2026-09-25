import { notFound } from 'next/navigation';

import PdfTemplate from '@/components/PdfTemplate';
import { getBranding } from '@/lib/config/branding';
import { PublicProposalAccessError, resolvePublicProposalAccess } from '@/lib/proposal/publicAccess';
import { runWithTenantAsync } from '@/lib/tenant/context';
import './pdf-print.css';

export const metadata = {
  robots: 'noindex, nofollow',
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PdfPage({ params }: Props) {
  const { token } = await params;

  let access;
  try {
    access = await resolvePublicProposalAccess(token);
  } catch (error) {
    if (error instanceof PublicProposalAccessError) notFound();
    throw error;
  }

  if (!access) {
    notFound();
  }

  const branding = await runWithTenantAsync(access.tenantId, () =>
    getBranding(access.tenantId)
  );

  return (
    <div className="pdf-root" data-pdf-ready>
      <PdfTemplate proposal={access.proposal} branding={branding} />
    </div>
  );
}
