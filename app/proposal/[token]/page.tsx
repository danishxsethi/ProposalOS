import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getBranding } from '@/lib/config/branding';
import { prisma } from '@/lib/prisma';

import ProposalPage from './ProposalPage';

interface Props {
  params: Promise<{ token: string }>;
}

async function getProposal(token: string) {
  return prisma.proposal.findUnique({
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
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const proposal = await prisma.proposal.findUnique({
    where: { webLinkToken: token },
    include: { audit: true },
  });

  if (!proposal) {
    return { title: 'Proposal Not Found' };
  }

  return {
    title: `${proposal.audit.businessName} Proposal`,
    description:
      proposal.executiveSummary || `Digital growth proposal for ${proposal.audit.businessName}`,
  };
}

export default async function Page({ params }: Props) {
  const { token } = await params;
  const proposal = await getProposal(token);

  if (!proposal) {
    notFound();
  }

  const branding = await getBranding(proposal.tenantId);

  return <ProposalPage proposal={proposal} branding={branding} />;
}
