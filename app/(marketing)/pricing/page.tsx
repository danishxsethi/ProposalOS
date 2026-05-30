import AgencyTiers from '@/components/pricing/agency-tiers';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm uppercase tracking-[0.2em] text-indigo-300">Pricing</p>
          <h1 className="text-5xl font-black text-white">
            Self-serve plans for audit-led agencies.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
            Pick a plan, create your workspace, and continue into onboarding to activate your
            Stripe-backed subscription.
          </p>
        </div>
        <AgencyTiers />
      </div>
    </div>
  );
}
