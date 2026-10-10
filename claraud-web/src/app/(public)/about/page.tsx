import type { Metadata } from 'next';
import Link from 'next/link';

import { Mail, MapPin } from 'lucide-react';

import { SectionWrapper } from '@/components/shared/section-wrapper';

export const metadata: Metadata = {
  title: 'About Claraud',
  description: 'Claraud is qualifying an operator-assisted website diagnostic pilot.',
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] pt-20 text-white">
      <SectionWrapper>
        <div className="mx-auto max-w-4xl px-4 py-16 md:py-24">
          <h1 className="mb-8 text-4xl font-bold leading-tight md:text-6xl">
            Website diagnostics grounded in evidence and human review.
          </h1>
          <div className="space-y-6 text-lg leading-relaxed text-text-secondary">
            <p>
              Claraud is being qualified for an operator-assisted website diagnostic pilot. We have
              not published verified customer results, benchmark data, or a validated comparison
              with agency pricing.
            </p>
            <p>
              The intended workflow is to inspect an authorized website, connect each proposed
              finding to retrievable evidence, and prepare practical next steps for a human to
              review. Reports should state their scope and limitations.
            </p>
            <p>
              Public self-service scan intake is paused while usage limits and browser network
              safeguards are verified. No audit, delivery time, or business outcome is promised on
              this page.
            </p>
          </div>
        </div>
      </SectionWrapper>

      <SectionWrapper className="bg-white/5">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h2 className="mb-6 text-3xl font-bold">Current availability</h2>
          <p className="mb-10 text-lg text-text-secondary">
            No self-service audit or agency package is open for purchase. Pilot scope, price,
            evidence quality, and delivery responsibilities still require review.
          </p>
          <div className="flex flex-col items-center justify-center gap-8 md:flex-row">
            <a href="mailto:hello@claraud.com" className="flex items-center gap-3 text-blue-300">
              <Mail className="h-5 w-5" />
              hello@claraud.com
            </a>
            <span className="flex items-center gap-3 text-text-secondary">
              <MapPin className="h-5 w-5" />
              Saskatoon, Saskatchewan, Canada
            </span>
          </div>
          <Link href="/" className="mt-10 inline-block text-text-secondary underline">
            Return to Claraud
          </Link>
        </div>
      </SectionWrapper>
    </main>
  );
}
