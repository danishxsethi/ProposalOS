import type { Metadata } from 'next';

import { Inter, JetBrains_Mono } from 'next/font/google';

import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PostHogProvider } from '@/providers/posthog-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider } from '@/providers/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  metadataBase: new URL('https://claraud.com'),
  title: {
    default: 'Claraud — Operator-Reviewed Website Diagnostics',
    template: '%s | Claraud',
  },
  description:
    'Claraud is qualifying an operator-assisted website diagnostic workflow. Public self-service scans are currently paused.',
  keywords: [
    'website audit',
    'business audit',
    'SEO audit',
    'Google Business Profile',
    'marketing audit',
    'operator-reviewed website diagnostics',
  ],
  authors: [{ name: 'Claraud' }],
  creator: 'Claraud',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://claraud.com',
    siteName: 'Claraud',
    title: 'Claraud — Operator-Reviewed Website Diagnostics',
    description: 'Public self-service scans are paused while the diagnostic workflow is qualified.',
    images: [{ url: '/api/og/default' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claraud — Operator-Reviewed Website Diagnostics',
    description: 'Public self-service scans are paused while the diagnostic workflow is qualified.',
    creator: '@tryclaraud',
    images: ['/api/og/default'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen flex flex-col`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 focus:bg-blue-600 focus:text-white"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <QueryProvider>
            <PostHogProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </PostHogProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
