import { notFound } from 'next/navigation';

import { Metadata } from 'next';

import { getBranding } from '@/lib/config/branding';
import { prisma } from '@/lib/prisma';
import { runWithTenantAsync, runWithTenantBypass } from '@/lib/tenant/context';

import PresentationClient from './PresentationClient';

interface Props {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const proposal = await runWithTenantBypass(() =>
    prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: { audit: true },
    })
  );

  if (!proposal) {
    return { title: 'Presentation Not Found' };
  }

  return {
    title: `Presentation for ${proposal.audit.businessName}`,
    description: 'Digital Presence Assessment Presentation',
  };
}

export default async function Page({ params }: Props) {
  const { token } = await params;

  const proposal = await runWithTenantBypass(() =>
    prisma.proposal.findUnique({
      where: { webLinkToken: token },
      include: {
        audit: {
          include: {
            findings: {
              where: { excluded: false },
              orderBy: { impactScore: 'desc' },
            },
          },
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

  return <PresentationClient proposal={proposal} branding={branding} />;
}
