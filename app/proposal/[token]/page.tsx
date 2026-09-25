import { notFound } from 'next/navigation';

import { getBranding } from '@/lib/config/branding';
import { PublicProposalAccessError, resolvePublicProposalAccess } from '@/lib/proposal/publicAccess';
import { runWithTenantAsync } from '@/lib/tenant/context';

import ProposalPage from './ProposalPage';

import type { Metadata } from 'next';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    const { proposal } = await resolvePublicProposalAccess(token);
    return {
      title: `${proposal.audit.businessName} Proposal`,
      description:
        proposal.executiveSummary || `Digital growth proposal for ${proposal.audit.businessName}`,
    };
  } catch {
    return { title: 'Proposal Not Found' };
  }
}

export default async function Page({ params }: Props) {
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

  return <ProposalPage proposal={access.proposal} branding={branding} />;
}
