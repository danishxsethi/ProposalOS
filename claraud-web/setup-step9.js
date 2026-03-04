const fs = require('fs');
const path = require('path');

const files = {
    'src/lib/constants.ts': `
export const AUDIT_CATEGORIES = [
  {id: 'website', name: 'Website Performance', icon: '🌐', color: '#3b82f6'},
  {id: 'google', name: 'Google Business Profile', icon: '📍', color: '#22c55e'},
  {id: 'seo', name: 'SEO & Content', icon: '📊', color: '#f59e0b'},
  {id: 'reviews', name: 'Reviews & Reputation', icon: '⭐', color: '#ef4444'},
  {id: 'social', name: 'Social & Presence', icon: '📱', color: '#8b5cf6'},
  {id: 'competitors', name: 'Competitive Intel', icon: '🏆', color: '#ec4899'}
];

export const NAV_LINKS = [
  { name: 'How It Works', href: '/#how-it-works' },
  { name: 'Pricing', href: '/pricing' },
  { name: 'Agencies', href: '/agencies' },
  { name: 'Blog', href: '/blog' }
];

export const PRICING_TIERS = {
  starter: { id: 'starter', name: 'Starter', price: 0 },
  pro: { id: 'pro', name: 'Pro', price: 49 },
  agency: { id: 'agency', name: 'Agency', price: 199 }
};
  `.trim(),

    'src/lib/types.ts': `
export interface ScanRequest {
  url: string;
  businessName?: string;
  city?: string;
  industry?: string;
}

export interface ScanStatus {
  token: string;
  status: 'pending' | 'scanning' | 'complete' | 'error';
  modules: ModuleStatus[];
  overallScore?: number;
}

export interface ModuleStatus {
  id: string;
  status: 'pending' | 'scanning' | 'complete' | 'error';
  score?: number;
  findingsCount?: number;
}

export interface ReportData {
  token: string;
  businessName: string;
  businessUrl: string;
  overallScore: number;
  letterGrade: string;
  categories: CategoryScore[];
  findings: Finding[];
  competitors: Competitor[];
}

export interface CategoryScore {
  id: string;
  name: string;
  score: number;
  summary: string;
}

export interface Finding {
  id: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  impact: string;
  evidence?: string;
  fixComplexity: 'quick-win' | 'moderate' | 'complex';
}

export interface Competitor {
  name: string;
  url: string;
  overallScore: number;
  reviewCount: number;
  pageSpeed: number;
  gbpCompleteness: number;
}

export interface Lead {
  email: string;
  businessUrl: string;
  scanToken: string;
  scores: Record<string, number>;
}
  `.trim(),

    'src/lib/api-client.ts': `
import { ScanRequest, ScanStatus, ReportData } from './types';

const BASE_URL = process.env.PROPOSAL_ENGINE_API_URL || '';
const API_KEY = process.env.PROPOSAL_ENGINE_API_KEY || '';

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL || '';
  // Default to relative /api if not calling proposal engine directly
  // The instructions imply calling PROPOSAL_ENGINE_API but it might be proxying through Next.js /api first
  // Based on the prompt we should use fetch wrapper for Proposal Engine API
  
  const headers = new Headers(options.headers || {});
  if (API_KEY && endpoint.startsWith('http')) {
    headers.set('Authorization', \`Bearer \${API_KEY}\`);
  }
  headers.set('Content-Type', 'application/json');

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 60000); // 60s timeout

  const response = await fetch(endpoint, {
    ...options,
    headers,
    signal: controller.signal,
  });
  
  clearTimeout(id);

  if (!response.ok) {
    throw new Error(\`API request failed: \${response.statusText}\`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  startScan: (req: ScanRequest) => fetchApi<{ token: string }>('/api/scan', { method: 'POST', body: JSON.stringify(req) }),
  getScanStatus: (token: string) => fetchApi<ScanStatus>(\`/api/scan-status/\${token}\`),
  getReport: (token: string) => fetchApi<ReportData>(\`/api/report/\${token}\`),
};
  `.trim(),

    'src/lib/posthog.ts': `
import posthog from 'posthog-js';

export const initPostHog = () => {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      loaded: (posthog) => {
        if (process.env.NODE_ENV === 'development') posthog.debug()
      }
    })
  }
  return posthog;
};
  `.trim(),

    'src/lib/resend.ts': `
import { Resend } from 'resend';

export const resend = new Resend(process.env.RESEND_API_KEY);
  `.trim(),

    'src/lib/stripe.ts': `
import Stripe from 'stripe';

export const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});
  `.trim(),

    'src/providers/posthog-provider.tsx': `
"use client";

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initPostHog } from '@/lib/posthog';
import posthog from 'posthog-js';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (pathname && typeof window !== 'undefined') {
      let url = window.origin + pathname;
      if (searchParams?.toString()) {
        url = url + '?' + searchParams.toString();
      }
      posthog.capture('$pageview', { $current_url: url });
    }
  }, [pathname, searchParams]);

  return <>{children}</>;
}
  `.trim(),

    'src/providers/theme-provider.tsx': `
"use client";

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" forceTheme="dark" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
  `.trim(),

    'src/hooks/use-posthog.ts': `
"use client";
import posthog from 'posthog-js';

export function usePostHog() {
  const captureEvent = (eventName: string, properties?: Record<string, any>) => {
    posthog.capture(eventName, properties);
  };
  return { captureEvent };
}
  `.trim(),

    'src/hooks/use-scan-progress.ts': `
"use client";
import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { ScanStatus } from '@/lib/types';

export function useScanProgress(token: string) {
  const [data, setData] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!token) return;

    let isPolling = true;

    const poll = async () => {
      try {
        const result = await apiClient.getScanStatus(token);
        if (isPolling) setData(result);
        if (result.status === 'complete' || result.status === 'error') {
          isPolling = false;
        } else {
          setTimeout(poll, 2000);
        }
      } catch (err) {
        if (isPolling) {
          setError(err as Error);
          isPolling = false;
        }
      }
    };

    poll();

    return () => {
      isPolling = false;
    };
  }, [token]);

  return { data, error, isLoading: !data && !error };
}
  `.trim(),

    'src/components/layout/navbar.tsx': `
"use client";
import Link from 'next/link';
import { motion } from 'framer-motion';
import { NAV_LINKS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function Navbar() {
  return (
    <motion.header 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="sticky top-0 z-50 w-full border-b border-white/10 glass"
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="font-bold font-sans text-2xl gradient-text lowercase">
          claraud
        </Link>
        <nav className="hidden md:flex gap-6">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
              {link.name}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex">
          <Button className="gradient-btn font-semibold" asChild>
            <Link href="/scan">Scan Free &rarr;</Link>
          </Button>
        </div>
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="glass bg-bg-secondary w-[250px]">
              <nav className="flex flex-col gap-4 mt-8">
                {NAV_LINKS.map(link => (
                  <Link key={link.href} href={link.href} className="text-lg font-medium text-text-secondary hover:text-white">
                    {link.name}
                  </Link>
                ))}
                <Button className="gradient-btn font-semibold mt-4" asChild>
                  <Link href="/scan">Scan Free &rarr;</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}
  `.trim(),

    'src/components/layout/footer.tsx': `
import Link from 'next/link';
import { NAV_LINKS } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="bg-[#0a0a0f] border-t border-white/10 pt-16 pb-8">
      <div className="container grid grid-cols-1 md:grid-cols-4 gap-12 lg:gap-8 mb-16">
        <div>
          <h3 className="font-bold text-xl gradient-text lowercase mb-4">claraud</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            AI-powered business audit tool that uncovers hidden growth opportunities in 30 seconds.
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-4">Product</h4>
          <ul className="space-y-3">
            {NAV_LINKS.map(link => (
              <li key={link.name}>
                <Link href={link.href} className="text-sm text-text-secondary hover:text-white transition-colors">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-4">Legal</h4>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-4">Trust</h4>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li className="flex items-center gap-2">✓ Powered by Google Cloud</li>
            <li className="flex items-center gap-2">✓ GDPR & PIPEDA Compliant</li>
            <li className="flex items-center gap-2">✓ 256-bit Encryption</li>
          </ul>
        </div>
      </div>
      <div className="container border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-text-secondary">
        <p>&copy; {new Date().getFullYear()} Claraud. All rights reserved.</p>
        <p className="mt-2 md:mt-0 lg:hidden">claraud.com</p>
      </div>
    </footer>
  );
}
  `.trim(),

    'src/components/shared/section-wrapper.tsx': `
"use client";
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

export function SectionWrapper({ children, id, className = "" }: { children: ReactNode, id?: string, className?: string }) {
  return (
    <motion.section 
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
      }}
      className={\`container mx-auto py-20 lg:py-32 \${className}\`}
    >
      {children}
    </motion.section>
  );
}
  `.trim(),

    'src/components/shared/animated-counter.tsx': `
"use client";
import { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

export function AnimatedCounter({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => latest.toFixed(1));
  const [display, setDisplay] = useState("0.0");

  useEffect(() => {
    const controls = animate(count, value, { duration });
    return controls.stop;
  }, [value, duration, count]);

  useEffect(() => {
    return rounded.on("change", (latest) => setDisplay(latest));
  }, [rounded]);

  return <motion.span>{display}</motion.span>;
}
  `.trim(),

    'src/components/shared/severity-badge.tsx': `
import { Badge } from '@/components/ui/badge';

export function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' | 'low' }) {
  const map = {
    critical: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Critical' },
    high:     { bg: 'bg-orange-500/10', text: 'text-orange-500', label: 'High' },
    medium:   { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Medium' },
    low:      { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'Low' }
  };
  const { bg, text, label } = map[severity];
  
  return (
    <Badge variant="outline" className={\`\${bg} \${text} border-transparent hover:\${bg} font-semibold\`}>
      {label}
    </Badge>
  );
}
  `.trim(),

    'src/components/scan/scan-input.tsx': `
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Globe, Search, Loader2 } from 'lucide-react';
import { usePostHog } from '@/hooks/use-posthog';

export function ScanInput({ variant = 'large' }: { variant?: 'large' | 'compact' }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { captureEvent } = usePostHog();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;
    setIsLoading(true);
    captureEvent('scan_started', { input });
    
    try {
      // Fake API call for the placeholder UX
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input })
      });
      if (res.ok) {
        // Typically would get { token } from the response
        router.push(\`/scan/\${Date.now()}\`);
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  const isLg = variant === 'large';

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      <form onSubmit={handleSubmit} className={\`relative flex items-center bg-bg-secondary border border-white/10 rounded-full shadow-lg p-1 \${isLg ? 'h-16' : 'h-12'}\`}>
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
          className={\`gradient-btn rounded-full \${isLg ? 'h-12 px-8' : 'h-10 px-6'}\`}
        >
          {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Scan Free \u2192"}
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
  `.trim()
};

for (const [filepath, content] of Object.entries(files)) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filepath, content);
}
console.log('Done creating shared components');
