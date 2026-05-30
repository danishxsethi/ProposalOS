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

  const proposal = (await apiClient.getProposal(token)) as ProposalData | null;

  if (!proposal) {
    const audit = (await apiClient.getAudit(token)) as AuditWithProposals | null;
    const webLinkToken = audit?.proposals?.[0]?.webLinkToken;

    if (webLinkToken && process.env.PROPOSAL_ENGINE_API_URL) {
      redirect(`${process.env.PROPOSAL_ENGINE_API_URL}/proposal/${webLinkToken}`);
    }

    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
        <div className="glass border border-red-500/20 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-xl font-bold text-white mb-2">Proposal Not Found</h2>
          <p className="text-text-secondary mb-6">
            Proposal not found. Your audit may still be processing.
          </p>
          <a href="/" className="gradient-btn px-6 py-2 rounded-full font-bold inline-block">
            Back to Home
          </a>
        </div>
      </div>
    );
  }

  // Render proposal data - currently just a placeholder
  // The actual proposal rendering would depend on the backend's proposal structure
  return (
    <div className="min-h-screen bg-bg-primary">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold text-white mb-8">Your Action Plan</h1>
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <p className="text-text-secondary mb-4">
            This is your personalized action plan based on your business audit.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <h3 className="font-bold text-green-400 mb-2">Executive Summary</h3>
              <p className="text-text-secondary">{proposal?.executiveSummary || 'Loading...'}</p>
            </div>

            {proposal?.tierEssentials && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <h3 className="font-bold text-blue-400 mb-2">Essentials Tier</h3>
                <p className="text-text-secondary">
                  Starting at ${proposal.pricing?.tierEssentials?.price || 'N/A'}/mo
                </p>
              </div>
            )}

            {proposal?.tierGrowth && (
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <h3 className="font-bold text-purple-400 mb-2">Growth Tier</h3>
                <p className="text-text-secondary">
                  Starting at ${proposal.pricing?.tierGrowth?.price || 'N/A'}/mo
                </p>
              </div>
            )}

            {proposal?.tierPremium && (
              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                <h3 className="font-bold text-orange-400 mb-2">Premium Tier</h3>
                <p className="text-text-secondary">
                  Starting at ${proposal.pricing?.tierPremium?.price || 'N/A'}/mo
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
