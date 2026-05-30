'use client';

import { useEffect } from 'react';

import Link from 'next/link';

import { AlertCircle, RefreshCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service like Sentry or PostHog
    console.error('Global Error Boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 text-center">
      <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-8 border border-red-500/20">
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">Something went wrong!</h1>
      <p className="text-text-secondary max-w-md mx-auto mb-8">
        A critical error occurred while rendering this page. Our team has been notified.
      </p>

      <div className="bg-black/50 border border-white/10 p-4 rounded-lg max-w-2xl w-full mb-8 overflow-auto text-left">
        <p className="text-red-400 font-mono text-sm break-all">
          {error.message || 'Unknown error'}
        </p>
        {error.digest && (
          <p className="text-text-secondary font-mono text-xs mt-2">Digest: {error.digest}</p>
        )}
      </div>

      <div className="flex gap-4">
        <Button onClick={() => reset()} className="bg-white text-black hover:bg-white/90">
          <RefreshCcw className="w-4 h-4 mr-2" /> Try again
        </Button>
        <Button
          asChild
          variant="outline"
          className="bg-transparent border-white/20 text-white hover:bg-white/10"
        >
          <Link href="/">Return to Home</Link>
        </Button>
      </div>
    </div>
  );
}
