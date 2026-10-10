import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pilot Availability | Claraud',
  description: 'Claraud is qualifying an operator-assisted diagnostic pilot. No package is available for purchase yet.',
};

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-32 text-center text-white">
      <div className="mx-auto max-w-2xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-300">
          Pilot availability
        </p>
        <h1 className="mb-6 text-4xl font-bold">Pricing follows a reviewed scope</h1>
        <p className="mb-5 text-lg text-text-secondary">
          Claraud is not currently accepting paid orders. A future operator-assisted pilot would
          require a written scope, an agreed price and currency, and a verified invoice before work
          begins.
        </p>
        <p className="mb-10 text-text-secondary">
          No performance guarantee, customer result, or automated checkout is offered here. Public
          self-service scans are paused while request and browser network safeguards are qualified.
        </p>
        <Link href="/" className="text-blue-300 underline underline-offset-4">
          Return to Claraud
        </Link>
      </div>
    </main>
  );
}
