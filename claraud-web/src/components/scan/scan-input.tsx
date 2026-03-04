"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Search, Loader2 } from 'lucide-react';
import { usePostHog } from '@/hooks/use-posthog';

export function ScanInput({
  variant = 'large',
  extraData
}: {
  variant?: 'large' | 'compact',
  extraData?: {
    industry?: string;
    competitors?: string[];
    includeEmail?: boolean;
    includeSocial?: boolean;
  }
}) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { captureEvent } = usePostHog();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    setIsLoading(true);
    captureEvent('scan_started', { input, ...extraData });

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: input,
          ...extraData
        })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        router.push(`/scan/${data.token}`);
      } else {
        throw new Error(data.error || 'Failed to start scan');
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const isLg = variant === 'large';

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      <form onSubmit={handleSubmit} className={`relative flex items-center bg-bg-secondary border border-white/10 rounded-full shadow-lg p-1 ${isLg ? 'h-16' : 'h-12'}`}>
        <div className="pl-4 pr-2 text-text-secondary">
          {input.includes('http') || input.includes('.') ? <Globe className={isLg ? 'w-5 h-5' : 'w-4 h-4'} /> : <Search className={isLg ? 'w-5 h-5' : 'w-4 h-4'} />}
        </div>
        <Input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => captureEvent('scan_input_focus')}
          placeholder="Enter your website URL or business name..."
          className="flex-1 bg-transparent border-none text-white focus-visible:ring-0 text-sm lg:text-base px-0"
        />
        <Button
          type="submit"
          disabled={isLoading || !input}
          className={`gradient-btn rounded-full ${isLg ? 'h-12 px-8' : 'h-10 px-6'}`}
        >
          {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Scan Free →"}
        </Button>
      </form>
      {isLg && (
        <div className="flex justify-center flex-wrap gap-4 text-xs font-medium text-text-secondary mt-2">
          <span>✓ No credit card</span>
          <span>✓ 30 seconds</span>
          <span>✓ 30+ dimensions</span>
        </div>
      )}
    </div>
  );
}