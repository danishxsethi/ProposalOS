import { Hero } from '@/components/home/hero';
import { ProblemSection } from '@/components/home/problem-section';
import { HowItWorks } from '@/components/home/how-it-works';
import { WhatWeAudit } from '@/components/home/what-we-audit';
import { SocialProof } from '@/components/home/social-proof';
import { IndustryVerticals } from '@/components/home/industry-verticals';
import { PricingPreview } from '@/components/home/pricing-preview';
import { AgencyCta } from '@/components/home/agency-cta';
import { FinalCta } from '@/components/home/final-cta';
import { StickyScanBar } from '@/components/layout/sticky-scan-bar';
import { JsonLd } from '@/components/shared/json-ld';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Claraud — AI-Powered Business Audit & Growth Platform",
  description: "Free 30-second AI audit. 30+ dimensions. Personalized action plan.",
  openGraph: {
    images: ['/api/og/default'],
  }
};

export default function Home() {
  const schemas = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Claraud",
      "url": "https://claraud.com",
      "logo": "https://claraud.com/logo.png",
      "sameAs": [
        "https://twitter.com/claraud",
        "https://linkedin.com/company/claraud"
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "url": "https://claraud.com",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://claraud.com/scan?url={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Claraud AI Audit",
      "operatingSystem": "All",
      "applicationCategory": "BusinessApplication",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      }
    }
  ];

  return (
    <>
      {schemas.map((s, i) => <JsonLd key={i} data={s} />)}
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <WhatWeAudit />
      <SocialProof />
      <IndustryVerticals />
      <PricingPreview />
      <AgencyCta />
      <FinalCta />
      <StickyScanBar />
    </>
  );
}
