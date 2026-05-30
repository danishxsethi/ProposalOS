'use client';

import { useEffect, useState } from 'react';

import ErrorBoundary from '@/components/ErrorBoundary';
import ProposalLoadingSkeleton from '@/components/ProposalLoadingSkeleton';
import { getBranding } from '@/lib/config/branding';

import ProposalPage from './ProposalPage';

export default function ProposalPageWrapper({ params }: { params: Promise<{ token: string }> }) {
  const [proposal, setProposal] = useState<any>(null);
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const { token } = await params;

        // Fetch proposal data
        const response = await fetch(`/api/proposal/token/${token}`);
        if (!response.ok) {
          if (response.status === 404) {
            window.location.href = '/404';
            return;
          }
          throw new Error(`Failed to fetch proposal: ${response.statusText}`);
        }

        const proposalData = await response.json();

        // Fetch branding
        const brandingResponse = await fetch('/api/branding'); // You might need to create this endpoint
        let brandingData = null;
        if (brandingResponse.ok) {
          brandingData = await brandingResponse.json();
        } else {
          // Fallback to default branding
          brandingData = {
            name: 'ProposalOS',
            logoUrl: null,
            colors: {
              primary: '#8B5CF6',
              accent: '#38BDF8',
              secondary: '#F59E0B',
            },
            contact: {
              email: null,
              phone: null,
              website: null,
            },
            tagline: 'Digital Presence Assessment',
            footerText: `© ${new Date().getFullYear()} ProposalOS. All rights reserved.`,
            showPoweredBy: true,
          };
        }

        setProposal(proposalData);
        setBranding(brandingData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching proposal data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load proposal');
        setLoading(false);
      }
    }

    fetchData();
  }, [params]);

  if (loading) {
    return <ProposalLoadingSkeleton />;
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Proposal Not Found</h2>
          <p className="text-gray-400 mb-4">
            The proposal you're looking for may have expired or doesn't exist.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: '#1a1a2e' }}
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Proposal Not Found</h2>
          <p className="text-gray-400">The proposal you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ProposalPage proposal={proposal} branding={branding} />
    </ErrorBoundary>
  );
}
