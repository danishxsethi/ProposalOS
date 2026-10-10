import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Agency Partnerships | Claraud',
  description: 'Agency and white-label partnerships are not currently available.',
};

export default function AgenciesPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-32 text-center text-white">
      <div className="mx-auto max-w-2xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-blue-300">
          Agency partnerships
        </p>
        <h1 className="mb-6 text-4xl font-bold">Partner access is not open</h1>
        <p className="mb-5 text-lg text-text-secondary">
          White-label plans, client seats, automated delivery, and agency performance claims are not
          currently offered. The core diagnostic workflow is still being qualified.
        </p>
        <p className="mb-10 text-text-secondary">
          Public scan intake is paused. We will publish partnership terms only after the workflow,
          delivery responsibilities, and customer evidence have been reviewed.
        </p>
        <Link href="/" className="text-blue-300 underline underline-offset-4">
          Return to Claraud
        </Link>
      </div>
    </main>
  );
}
