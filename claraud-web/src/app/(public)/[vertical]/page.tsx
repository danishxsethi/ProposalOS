import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Shield, TrendingUp, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
    params: { vertical: string };
}

// Allowed verticals for SEO pages. Any other slug will 404.
const ALLOWED_VERTICALS: Record<string, { title: string, keyword: string, icon: any }> = {
    'dentist': { title: "Dental Practices", keyword: "dentist", icon: Shield },
    'law-firm': { title: "Law Firms", keyword: "lawyer", icon: Shield },
    'hvac': { title: "HVAC Companies", keyword: "hvac", icon: Shield },
    'plumber': { title: "Plumbing Services", keyword: "plumber", icon: Shield },
    'roofing': { title: "Roofing Contractors", keyword: "roofer", icon: Shield },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const verticalData = ALLOWED_VERTICALS[params.vertical.toLowerCase()];
    if (!verticalData) return {};

    return {
        title: `Free Digital Audit for \${verticalData.title} | Claraud`,
    description: `Get a comprehensive technical, SEO, and performance audit for your \${verticalData.title}. Uncover hidden revenue opportunities today.`,
    keywords: [`\${verticalData.keyword} marketing`, `\${verticalData.keyword} seo`, `audit for \${verticalData.title.toLowerCase()}`]
  };
}

export default function VerticalLandingPage({ params }: Props) {
  const verticalSlug = params.vertical.toLowerCase();
  const verticalData = ALLOWED_VERTICALS[verticalSlug];

  if (!verticalData) {
    notFound();
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-bg-primary pt-32 pb-24 md:pt-48 md:pb-32">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-primary/10 border border-accent-primary/20 text-accent-primary text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-primary"></span>
            </span>
            Specifically for {verticalData.title}
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6">
            Stop losing patients to <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary to-accent-secondary">
              competitors across town
            </span>
          </h1>
          
          <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto">
            Our AI-powered audit engine analyzes your {verticalData.keyword} website against 50+ ranking signals to show exactly why you aren't ranking #1.
          </p>
          
          <Button size="lg" asChild className="bg-white text-black hover:bg-gray-100 rounded-full px-8 py-6 text-lg font-medium">
            <Link href="/scan">
              Run Free Audit <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
          
          <p className="text-sm text-text-secondary mt-4">Takes 60 seconds • No credit card required</p>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 bg-bg-secondary border-t border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Why do a digital audit?</h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">Uncover the technical blindspots costing you revenue.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="bg-bg-primary border-white/10 hover:border-white/20 transition-all">
              <CardContent className="p-8">
                <Search className="w-12 h-12 text-blue-400 mb-6" />
                <h3 className="text-xl font-bold text-white mb-3">SEO Visibility</h3>
                <p className="text-text-secondary leading-relaxed">Discover why competitors outrank you on Google Maps and organic search results.</p>
              </CardContent>
            </Card>
            <Card className="bg-bg-primary border-white/10 hover:border-white/20 transition-all">
              <CardContent className="p-8">
                <TrendingUp className="w-12 h-12 text-green-400 mb-6" />
                <h3 className="text-xl font-bold text-white mb-3">Conversion Rate</h3>
                <p className="text-text-secondary leading-relaxed">Identify friction points that stop visitors from calling or booking appointments.</p>
              </CardContent>
            </Card>
            <Card className="bg-bg-primary border-white/10 hover:border-white/20 transition-all">
              <CardContent className="p-8">
                <Shield className="w-12 h-12 text-purple-400 mb-6" />
                <h3 className="text-xl font-bold text-white mb-3">Technical Health</h3>
                <p className="text-text-secondary leading-relaxed">Find broken links, slow loading times, and mobile responsiveness issues securely.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Footer Section */}
      <section className="py-24 bg-accent-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20" />
        <div className="container relative z-10 mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-3xl">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to grow your {verticalData.keyword} business?</h2>
          <p className="text-xl text-white/80 mb-10">Join hundreds of {verticalData.title.toLowerCase()} accelerating their growth with our insights.</p>
          <Button size="lg" asChild className="bg-black text-white hover:bg-gray-900 rounded-full px-10 py-7 text-lg border-2 border-transparent">
            <Link href="/scan">
              Get Your Report <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
