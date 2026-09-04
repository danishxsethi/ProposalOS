import { redirect } from 'next/navigation';

import { apiClient } from '@/lib/api-client';
interface ProposalTierPricing {
  price?: number;
}

interface ProposalData {
  executiveSummary?: string;
  tierEssentials?: Record<string, unknown>;
  tierGrowth?: Record<string, unknown>;
  tierPremium?: Record<string, unknown>;
  pricing?: {
    tierEssentials?: ProposalTierPricing;
    tierGrowth?: ProposalTierPricing;
    tierPremium?: ProposalTierPricing;
  };
}

interface AuditWithProposals {
  proposals?: Array<{ webLinkToken?: string }>;
}

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const engineUrl =
    process.env.PROPOSAL_ENGINE_API_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://proposal-engine-staging-ouitkhk5xq-uc.a.run.app';

  // Seamlessly route to the canonical conversion proposal engine
  redirect(`${engineUrl}/proposal/${token}`);
}
