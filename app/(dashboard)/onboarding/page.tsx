import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { session_id?: string; type?: string; proposalId?: string; complete?: string };
}) {
  const session = await auth();
  const tenantId =
    session?.user && 'tenantId' in session.user
      ? (session.user as { tenantId?: string }).tenantId
      : undefined;
  if (!tenantId) {
    redirect('/login');
  }

  if (searchParams.complete === '1') {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { onboardingCompletedAt: new Date() },
    });
    redirect('/dashboard');
  }

  const [tenant, branding, proposal] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.tenantBranding.findUnique({ where: { tenantId } }),
    searchParams.proposalId
      ? prisma.proposal.findUnique({ where: { id: searchParams.proposalId } })
      : Promise.resolve(null),
  ]);

  const proposalFlow = searchParams.type === 'proposal';
  const steps = proposalFlow
    ? [
        {
          title: 'Welcome',
          description:
            'Your payment was received and we have started provisioning delivery for your proposal.',
        },
        {
          title: 'Delivery Status',
          description: proposal
            ? `Proposal ${proposal.id.slice(0, 8)} is now in delivery kickoff.`
            : 'We are preparing your deliverables now.',
        },
        {
          title: 'Client View',
          description: 'Check your client dashboard and live progress page any time.',
        },
      ]
    : [
        {
          title: 'Welcome',
          description: `Your current plan is ${tenant?.planTier ?? 'free'} and billing status is ${tenant?.subscriptionStatus ?? 'pending'}.`,
        },
        {
          title: 'Connect Accounts',
          description:
            'Add your website URL, Google Business Profile, and social accounts so audits have the right context.',
        },
        {
          title: 'Customize Branding',
          description: `Brand name: ${branding?.brandName ?? tenant?.name ?? 'Not set yet'}. Add your logo and colors next.`,
        },
        {
          title: 'First Audit',
          description:
            'Run your first audit or revisit an existing proposal to see value immediately.',
        },
        {
          title: 'Go Live',
          description:
            'Once setup looks good, head to the dashboard and start running the workflow day to day.',
        },
      ];

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-blue-300">Onboarding</p>
          <h1 className="mb-3 text-4xl font-bold">
            {proposalFlow ? 'Your proposal is in motion.' : 'Welcome to ProposalOS.'}
          </h1>
          <p className="max-w-2xl text-slate-300">
            {proposalFlow
              ? 'We have your payment and the delivery engine is kicking off. Use the steps below to follow progress and stay aligned.'
              : 'Use this setup guide to confirm your plan, connect your business context, brand the workspace, and get to your first result fast.'}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {steps.map((step, index) => (
            <div key={step.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 font-semibold text-blue-300">
                {index + 1}
              </div>
              <h2 className="mb-2 text-xl font-semibold">{step.title}</h2>
              <p className="text-sm leading-6 text-slate-300">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-4">
          {!proposalFlow && (
            <>
              <Link
                href="/settings/integrations"
                className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-950"
              >
                Connect accounts
              </Link>
              <Link
                href="/settings/branding"
                className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white"
              >
                Customize branding
              </Link>
              <Link
                href="/new-audit"
                className="rounded-xl border border-white/15 px-5 py-3 font-semibold text-white"
              >
                Run first audit
              </Link>
            </>
          )}

          {proposalFlow && proposal && (
            <Link
              href={`/client/dashboard?token=${proposal.webLinkToken}`}
              className="rounded-xl bg-white px-5 py-3 font-semibold text-slate-950"
            >
              View delivery dashboard
            </Link>
          )}

          <Link
            href="/onboarding?complete=1"
            className="rounded-xl border border-blue-400/40 bg-blue-500/10 px-5 py-3 font-semibold text-blue-200"
          >
            Finish onboarding
          </Link>
        </div>
      </div>
    </div>
  );
}
