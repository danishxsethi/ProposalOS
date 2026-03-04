import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportHeader } from '@/components/report/report-header';
import { ScoreOverview } from '@/components/report/score-overview';
import { FindingsList } from '@/components/report/findings-list';
import { CompetitorTable } from '@/components/report/competitor-table';
import { ReportCTA } from '@/components/report/report-cta';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { ReportData } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Shield, Smartphone, Search, Award, Share2, Zap } from 'lucide-react';

// SEO - Dynamic Metadata
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
    const { token } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    try {
        const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const data: ReportData = await res.json();

        return {
            title: `${data.businessName} — AI Business Audit | Score: ${data.overallScore}/100`,
            description: `Claraud AI audited ${data.businessName} across 30 dimensions. Overall score: ${data.overallScore}/100. Top finding: ${data.findings[0]?.title || 'Multiple critical issues identified.'}`,
            openGraph: {
                title: `${data.businessName} AI Audit Report`,
                description: `View the full AI audit for ${data.businessName}.`,
                images: [`/api/og/${token}`],
            }
        };
    } catch (e) {
        return { title: 'Audit Report | Claraud AI' };
    }
}

export default async function ReportPage({ params }: { params: { token: string } }) {
    const { token } = await params;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    let reportData: ReportData;
    try {
        const res = await fetch(`${baseUrl}/api/report/${token}`, { cache: 'no-store' });
        if (!res.ok) return notFound();
        reportData = await res.json();
    } catch (e) {
        return notFound();
    }

    const categoryIcons: Record<string, any> = {
        website: Smartphone,
        google: Shield,
        seo: Search,
        reviews: Award,
        social: Share2,
        competitors: Zap
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

                {/* Section 2: Top Findings */}
                <SectionWrapper className="mb-32">
                    <FindingsList findings={reportData.findings} limit={5} />
                </SectionWrapper>

                {/* Section 3: Comparison */}
                <SectionWrapper className="mb-32">
                    <CompetitorTable
                        businessName={reportData.businessName}
                        businessUrl={reportData.businessUrl}
                        userMetrics={{
                            overallScore: reportData.overallScore,
                            reviewCount: 41,
                            pageSpeed: 62,
                            gbpCompleteness: 62
                        }}
                        competitors={reportData.competitors}
                    />
                </SectionWrapper>

                {/* Section 4: All Findings (Grouped) */}
                <SectionWrapper className="mb-32" id="all-findings">
                    <h2 className="text-3xl font-extrabold text-white mb-10 tracking-tight">Complete Audit Findings</h2>

                    <div className="grid grid-cols-1 gap-6">
                        {reportData.categories.map((cat) => {
                            const Icon = categoryIcons[cat.id] || Shield;
                            const catFindings = reportData.findings.filter(f => f.category === cat.id);

                            return (
                                <div key={cat.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden">
                                    <div className="px-8 py-6 bg-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-blue-400">
                                                <Icon className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-white">{cat.name}</h3>
                                                <p className="text-xs text-text-secondary mt-1 tracking-wide">{catFindings.length} findings</p>
                                            </div>
                                        </div>
                                        <Badge className="bg-bg-input border-white/10 text-white font-mono px-4 py-1 text-base">
                                            {cat.score}/100
                                        </Badge>
                                    </div>
                                    <div className="p-4 bg-transparent text-left">
                                        <FindingsList
                                            findings={catFindings}
                                            limit={99}
                                            title=""
                                        />
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