import { notFound } from 'next/navigation';

import { BarChart3 } from 'lucide-react';

import { ScanInput } from '@/components/scan/scan-input';
import { JsonLd } from '@/components/shared/json-ld';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { SeverityBadge } from '@/components/shared/severity-badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { getAllIndustrySlugs, getIndustry } from '@/lib/industries';

export async function generateStaticParams() {
  return getAllIndustrySlugs().map((slug) => ({
    vertical: slug,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const industry = getIndustry(vertical);
  if (!industry) return {};

  return {
    title: `Free AI Website Audit for ${industry.name} | Claraud`,
    description: `Get a free 30-second AI audit of your ${industry.name.toLowerCase()} website. Compare against competitors, find hidden issues, and get a personalized action plan.`,
    keywords: industry.keywords.join(', '),
  };
}

export default async function IndustryPage({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = await params;
  const industry = getIndustry(vertical);

  if (!industry) {
    notFound();
  }

  const industrySchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'AI Website Audit',
    provider: {
      '@type': 'Organization',
      name: 'Claraud',
    },
    areaServed: 'North America',
    description: industry.subheadline,
    name: `Free AI Audit for ${industry.name}`,
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: industry.problems.map((p) => ({
      '@type': 'Question',
      name: p.title,
      acceptedAnswer: {
        '@type': 'Answer',
        text: p.description,
      },
    })),
  };

  return (
    <div className="bg-[#0a0a0f] min-h-screen pt-32 pb-20">
      <JsonLd data={industrySchema} />
      <JsonLd data={faqSchema} />

      {/* Section 1: Hero */}
      <SectionWrapper>
        <div className="text-center max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-bold mb-8">
            <span>{industry.icon}</span>
            <span>{industry.name}</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            {industry.headline}
          </h1>
          <p className="text-text-secondary text-xl mb-12 max-w-2xl mx-auto leading-relaxed">
            {industry.subheadline}
          </p>
          <div className="max-w-2xl mx-auto mb-8">
            <ScanInput variant="large" />
          </div>
          <p className="text-text-secondary text-sm font-medium">
            Trusted by {industry.name.toLowerCase()} businesses across North America
          </p>
        </div>
      </SectionWrapper>

      {/* Section 2: Industry Problems */}
      <SectionWrapper className="py-24 bg-white/5">
        <div className="text-center mb-16 px-4">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            The {industry.name.toLowerCase()} marketing problems{' '}
            <span className="gradient-text">no one talks about.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
          {industry.problems.map((problem, idx) => (
            <div
              key={idx}
              className="glass p-8 rounded-2xl border border-white/10 hover:border-blue-500/30 transition-all group h-full flex flex-col"
            >
              <Badge className="w-fit mb-4 bg-orange-500/10 text-orange-400 border-orange-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest">
                {problem.stat}
              </Badge>
              <h3 className="text-xl font-bold text-white mb-4 group-hover:text-blue-400 transition-colors">
                {problem.title}
              </h3>
              <p className="text-text-secondary text-sm leading-relaxed flex-1">
                {problem.description}
              </p>
            </div>
          ))}
        </div>
      </SectionWrapper>

      {/* Section 3: Sample Findings */}
      <SectionWrapper className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              What we find in a typical {industry.name.toLowerCase()} audit.
            </h2>
            <p className="text-text-secondary">
              Claraud scans over 30 dimensions of your digital presence instantly.
            </p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {industry.sampleFindings.map((finding, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                className="glass border border-white/10 rounded-2xl overflow-hidden px-2"
              >
                <AccordionTrigger className="px-6 py-5 hover:no-underline text-left group text-white font-semibold">
                  <div className="flex items-center gap-4 w-full pr-4">
                    <SeverityBadge severity={finding.severity as any} />
                    <span className="text-white font-semibold text-lg line-clamp-1">
                      {finding.title}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6 pt-2">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 p-1 rounded-full bg-blue-500/20 text-blue-400">
                        <BarChart3 className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-1">
                          Impact statement
                        </p>
                        <p className="text-text-primary text-base font-medium">{finding.impact}</p>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </SectionWrapper>

      {/* Section 4: Benchmarks */}
      <SectionWrapper className="py-24 bg-white/5">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
              How does your {industry.name.toLowerCase()} stack up?
            </h2>
          </div>

          <div className="glass rounded-3xl border border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/10">
                    <th className="py-6 px-8 text-sm font-bold uppercase tracking-widest text-text-secondary border-b border-white/10">
                      Metric
                    </th>
                    <th className="py-6 px-8 text-sm font-bold uppercase tracking-widest text-text-secondary border-b border-white/10">
                      Industry Avg
                    </th>
                    <th className="py-6 px-8 text-sm font-bold uppercase tracking-widest text-text-secondary border-b border-white/10 text-green-400">
                      Top Performer
                    </th>
                    <th className="py-6 px-8 text-sm font-bold uppercase tracking-widest text-blue-400 border-b border-white/10">
                      Your Business
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {industry.benchmarks.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-6 px-8 font-semibold text-white">{row.metric}</td>
                      <td className="py-6 px-8 text-text-secondary">{row.average}</td>
                      <td className="py-6 px-8 text-green-400 font-bold">{row.topPerformer}</td>
                      <td className="py-6 px-8 text-blue-400 font-bold italic">?</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-8 bg-blue-500/5 text-center">
              <p className="text-text-secondary mb-4 text-sm">
                Get your business's scores in under 30 seconds.
              </p>
              <div className="max-w-md mx-auto">
                <ScanInput variant="compact" />
              </div>
            </div>
          </div>
        </div>
      </SectionWrapper>

      {/* Section 5: Industry CTA */}
      <SectionWrapper className="py-32">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Find out where your {industry.name.toLowerCase()} business stands.
          </h2>
          <div className="max-w-2xl mx-auto mb-8">
            <ScanInput variant="large" />
          </div>
          <p className="text-text-secondary text-lg">Free. 30 seconds. No credit card.</p>
        </div>
      </SectionWrapper>
    </div>
  );
}
