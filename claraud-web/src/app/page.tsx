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

export default function Home() {
  return (
    <>
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
