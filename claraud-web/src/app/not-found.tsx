import Link from 'next/link';

import { ArrowLeft, Ghost } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 text-center">
      <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-8">
        <Ghost className="w-12 h-12 text-text-secondary" />
      </div>
      <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">404</h1>
      <h2 className="text-2xl font-medium text-white mb-4">Page not found</h2>
      <p className="text-text-secondary max-w-md mx-auto mb-8">
        We couldn't find the page you were looking for. It might have been moved, deleted, or never
        existed in the first place.
      </p>
      <div className="flex gap-4">
        <Button
          asChild
          variant="outline"
          className="bg-transparent border-white/20 text-white hover:bg-white/10"
        >
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
          </Link>
        </Button>
        <Button asChild className="bg-white text-black hover:bg-white/90">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
