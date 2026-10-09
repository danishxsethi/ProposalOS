import { notFound } from 'next/navigation';

import { Award, Search, Share2, Shield, Smartphone, Zap } from 'lucide-react';
import { Metadata } from 'next';

import { FindingsList } from '@/components/report/findings-list';
import { ReportCTA } from '@/components/report/report-cta';
import { ReportHeader } from '@/components/report/report-header';
import { ScoreOverview } from '@/components/report/score-overview';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Badge } from '@/components/ui/badge';
import { ReportData } from '@/lib/types';

// SEO - Dynamic Metadata
export function generateMetadata(): Metadata {
  return {
    title: 'Preliminary Audit Report | Claraud',
    description: 'A token-protected preliminary report. Review evidence before acting.',
    robots: { index: false, follow: false },
  };
}

export default async function ReportPage({ params }: { params: { token: string } }) {
  const { token } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  let reportData: ReportData;
  try {
    const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: 'no-store' });
    if (!res.ok) return notFound();
    reportData = await res.json();
  } catch {
    return notFound();
  }

  const categoryIcons: Record<string, typeof Smartphone> = {
    website: Smartphone,
    google: Shield,
    seo: Search,
    reviews: Award,
    social: Share2,
    competitors: Zap,
  };

  return (
    <main className="min-h-screen bg-bg-primary pb-24 selection:bg-blue-500/30 overflow-x-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 pt-12 relative z-10">
        {/* Section 0: Header */}
        <section className="mb-20">
          <ReportHeader
            businessName={reportData.businessName}
            businessUrl={reportData.businessUrl}
            overallScore={reportData.overallScore}
            letterGrade={reportData.letterGrade}
            token={token}
          />
        </section>

        {/* Section 1: Score Overview */}
        <SectionWrapper className="mb-32">
          <ScoreOverview categories={reportData.categories} />
        </SectionWrapper>

        <aside
          role="note"
          className="mb-12 rounded-xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-text-secondary"
        >
          Preliminary report: verify each observation and its source before relying on it. This view
          does not establish lost revenue, competitor performance, or expected results.
        </aside>

        {/* Section 2: Top Findings */}
        <SectionWrapper className="mb-32">
          <FindingsList findings={reportData.findings} limit={5} />
        </SectionWrapper>

        {/* Section 3: All Findings (Grouped) */}
        <SectionWrapper className="mb-32" id="all-findings">
          <h2 className="text-3xl font-extrabold text-white mb-10 tracking-tight">
            Complete Audit Findings
          </h2>

          <div className="grid grid-cols-1 gap-6">
            {reportData.categories.map((cat) => {
              const Icon = categoryIcons[cat.id] || Shield;
              const catFindings = reportData.findings.filter((f) => f.category === cat.id);

              return (
                <div
                  key={cat.id}
                  className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden"
                >
                  <div className="px-8 py-6 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-blue-400">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                        <p className="text-xs text-text-secondary mt-1 tracking-wide">
                          {catFindings.length} findings
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-bg-input border-white/10 text-white font-mono px-4 py-1 text-base">
                      {cat.score.toFixed(1)}/10
                    </Badge>
                  </div>
                  <div className="p-4 bg-transparent text-left">
                    <FindingsList findings={catFindings} limit={99} title="" />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionWrapper>

        {/* Section 5: Final CTA */}
        <SectionWrapper>
          <ReportCTA token={token} />
        </SectionWrapper>
      </div>
    </main>
  );
}
