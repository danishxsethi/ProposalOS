import Link from 'next/link';

import { Metadata } from 'next';

import { ScanInput } from '@/components/scan/scan-input';

export const metadata: Metadata = {
  title: 'Self-Service Scans Paused | Claraud',
};

export default function ScanPage() {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-16">
      {/* Back link */}
      <div className="w-full max-w-xl mb-8">
        <Link href="/" className="text-sm text-text-secondary hover:text-white transition-colors">
          ← Back to home
        </Link>
      </div>

      {/* Heading */}
      <div className="w-full max-w-xl text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
          Self-service scans are paused
        </h1>
        <p className="text-text-secondary">
          This page will not start a scan. Intake will reopen after usage and browser network controls
          are qualified.
        </p>
      </div>

      {/* Main Interactive Island */}
      <div className="w-full max-w-xl mb-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
        <ScanInput variant="large" />
      </div>

    </div>
  );
}
