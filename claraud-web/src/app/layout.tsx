import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/providers/theme-provider';
import { PostHogProvider } from '@/providers/posthog-provider';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { TooltipProvider } from '@/components/ui/tooltip';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  title: 'Claraud — AI Business Audit',
  description: 'Free 30-second AI audit of your website, Google presence, competitors, reviews, and social media.',
  openGraph: {
    title: 'Claraud — AI Business Audit',
    description: 'Free 30-second AI audit of your website, Google presence, competitors, reviews, and social media.',
    url: 'https://claraud.com',
    siteName: 'Claraud',
    images: [{ url: '/api/og/default' }],
    locale: 'en_US',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen flex flex-col`}>
        <ThemeProvider>
          <PostHogProvider>
            <TooltipProvider>
              <Navbar />
              <main className="flex-1">
                {children}
              </main>
              <Footer />
            </TooltipProvider>
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
