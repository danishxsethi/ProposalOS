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
    default: 'Claraud — AI Business Audit | Free Website & Marketing Audit',
    template: '%s | Claraud',
  },
  description:
    'Free 30-second AI audit of your website, Google presence, competitors, reviews, and social media. Get a personalized action plan to grow.',
  keywords: [
    'website audit',
    'business audit',
    'SEO audit',
    'Google Business Profile',
    'marketing audit',
    'free website audit',
  ],
  authors: [{ name: 'Claraud' }],
  creator: 'Claraud',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://claraud.com',
    siteName: 'Claraud',
    title: 'Claraud — AI Business Audit',
    description:
      'Free 30-second AI audit of your website, Google presence, competitors, reviews, and social media.',
    images: [{ url: '/api/og/default' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claraud — AI Business Audit',
    description: 'Free 30-second AI audit. 30+ dimensions. Personalized action plan.',
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
