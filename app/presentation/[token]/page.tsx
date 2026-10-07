import { notFound } from 'next/navigation';

import { Metadata } from 'next';

import { getBranding } from '@/lib/config/branding';
import { PublicProposalAccessError, resolvePublicProposalAccess } from '@/lib/proposal/publicAccess';
import { runWithTenantAsync } from '@/lib/tenant/context';

import PresentationClient from './PresentationClient';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    const { proposal } = await resolvePublicProposalAccess(token);
    return {
      title: `Presentation for ${proposal.audit.businessName}`,
      description: 'Digital Presence Assessment Presentation',
    };
  } catch {
    return { title: 'Presentation Not Found' };
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

  return <PresentationClient proposal={access.proposal} branding={branding} />;
}
