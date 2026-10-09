import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export function generateMetadata(): Metadata {
  return {
    title: 'Proposal | Claraud',
    robots: { index: false, follow: false },
  };
}

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const engineUrl =
    process.env.PROPOSAL_ENGINE_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://claraud.com';

  redirect(`${engineUrl}/proposal/${token}`);
}
