import type { Metadata } from 'next';

import { Hero } from '@/components/home/hero';
import { HowItWorks } from '@/components/home/how-it-works';

export const metadata: Metadata = {
  title: 'Claraud — Operator-Reviewed Website Diagnostics',
  description:
    'Claraud is qualifying an operator-assisted website diagnostic workflow. Public self-service scans are currently paused.',
  openGraph: {
    images: ['/api/og/default'],
  },
};

export default function Home() {
  return (
    <main>
      <Hero />
      <HowItWorks />
    </main>
  );
}
