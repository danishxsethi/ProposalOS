'use client';

import { useEffect, useRef, useState } from 'react';

import dynamic from 'next/dynamic';

import { buildProposalConversionModel } from '@/lib/proposal/conversionViewModel';

import { useProposalViewTracking } from './ProposalViewTracker';

const ProposalShareButton = dynamic(
  () => import('@/components/ProposalShareButton').then((mod) => mod.ProposalShareButton),
  { ssr: false }
);

interface ProposalProps {
  proposal: any;
  branding?: {
    name: string;
    logoUrl?: string | null;
    contact?: { website?: string; email?: string };
    colors?: { primary?: string; accent?: string };
  };
}

export default function ProposalPage({ proposal, branding }: ProposalProps) {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  const { trackCta, trackExpand } = useProposalViewTracking(proposal.webLinkToken);

  const model = buildProposalConversionModel(proposal, {
    calendarUrl: branding?.contact?.website || process.env.OUTREACH_CALENDAR_URL,
  });

  const brandName = branding?.name || model.brandName;
  const bookingUrl = model.calendarBookingUrl;

  useEffect(() => {
    const handleScroll = () => {
      if (heroRef.current) {
        const bottom = heroRef.current.getBoundingClientRect().bottom;
        setShowStickyBar(bottom < 0);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleBookingClick = (location: string, tierId?: string) => {
    trackCta(tierId ? `book_call_${location}_${tierId}` : `book_call_${location}`);
    const targetUrl = new URL(bookingUrl, window.location.href);
    targetUrl.searchParams.set('prospect', model.businessName);
    targetUrl.searchParams.set('token', model.token);
    if (tierId) targetUrl.searchParams.set('tier', tierId);
    window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer');
  };

  const toggleFinding = (id: string) => {
    const next = expandedFinding === id ? null : id;
    setExpandedFinding(next);
    if (next) trackExpand(`finding_${id}`);
  };

  return (
    <div className="min-h-screen bg-[#0b132b] text-white selection:bg-[#4361ee]/30 font-sans antialiased">
      {/* ─── Urgency Alert Banner (Sticky Top) ────────────────── */}
      <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20 border-b border-amber-500/30 px-4 py-2 text-center text-xs sm:text-sm font-medium text-amber-200">
        <span className="font-bold">⏰ Pricing & Bandwidth Guarantee:</span> Audit findings and sprint pricing locked until{' '}
        <span className="underline font-bold text-white">{model.expiryDateFormatted}</span>.
      </div>

      {/* ─── Global Top Nav ─────────────────────────────────────── */}
      <header className="border-b border-white/10 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tight text-white">{brandName}</span>
            <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Verified Audit
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/api/proposal/token/${model.token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download PDF</span>
            </a>
            <button
              onClick={() => handleBookingClick('header')}
              className="px-4 py-2 rounded-lg text-xs sm:text-sm font-bold text-white bg-[#22c55e] hover:bg-[#16a34a] transition-all shadow-md shadow-emerald-900/20 flex items-center gap-1.5 cursor-pointer"
            >
              <span>{model.singleCtaText}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── 1. Hook Header (Above the Fold with CTA) ───────────── */}
      <div ref={heroRef} className="relative overflow-hidden pt-12 pb-16 px-4 sm:px-6 border-b border-white/10 bg-gradient-to-b from-[#0f172a] via-[#0b132b] to-[#0b132b]">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30 mb-6">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Revenue Bleed Diagnostic • {model.businessCity}
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            {model.businessName} is losing an estimated{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-500">
              {model.hookHeader.totalMonthlyBleedFormatted}
            </span>{' '}
            to competitor search gaps
          </h1>

          <p className="text-lg sm:text-xl text-white/70 max-w-3xl mx-auto mb-8 leading-relaxed">
            Forensic analysis of your live web infrastructure identified high-friction gaps in structured schema, mobile delivery, and local citation authority.
          </p>

          {/* Above-The-Fold Single CTA Button */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-10">
            <button
              onClick={() => handleBookingClick('hero')}
              className="w-full sm:w-auto px-8 py-4 rounded-xl text-base sm:text-lg font-bold text-white bg-[#22c55e] hover:bg-[#16a34a] shadow-xl shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{model.singleCtaText}</span>
              <span className="text-xl">→</span>
            </button>
            <span className="text-xs text-white/50">{model.singleCtaSubtext}</span>
          </div>

          {/* KPI Snapshot Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm text-left">
              <div className="text-xs font-semibold uppercase text-rose-400 tracking-wider">Estimated Monthly Bleed</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">{model.hookHeader.totalMonthlyBleedFormatted}</div>
              <div className="text-xs text-white/50 mt-0.5">Recoverable revenue</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm text-left">
              <div className="text-xs font-semibold uppercase text-indigo-400 tracking-wider">Primary Leak</div>
              <div className="text-sm font-bold text-white mt-2 truncate" title={model.hookHeader.primaryProblemTitle}>
                {model.hookHeader.primaryProblemTitle}
              </div>
              <div className="text-xs text-rose-400 font-semibold mt-0.5">-{model.hookHeader.primaryProblemLossFormatted}/mo</div>
            </div>
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm text-left">
              <div className="text-xs font-semibold uppercase text-emerald-400 tracking-wider">Sprint Resolution</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">5–14 Days</div>
              <div className="text-xs text-white/50 mt-0.5">Rapid code deployment</div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. Executive Summary (3 Findings Max with $) ────────── */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="mb-8">
          <span className="text-xs font-bold uppercase tracking-wider text-[#4361ee]">Diagnostic Brief</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">Executive Summary</h2>
          <p className="text-white/70 text-base mt-2 leading-relaxed">
            {model.executiveSummary.overview}
          </p>
        </div>

        <div className="space-y-4 mb-10">
          {model.executiveSummary.topThreePoints.map((item, idx) => (
            <div
              key={idx}
              className="p-5 rounded-xl bg-[#0f172a] border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    Finding #{idx + 1}
                  </span>
                  <h3 className="font-bold text-white text-base sm:text-lg">{item.title}</h3>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{item.explanation}</p>
              </div>
              <div className="text-left sm:text-right shrink-0 bg-white/5 sm:bg-transparent p-3 sm:p-0 rounded-lg">
                <div className="text-lg sm:text-xl font-black text-rose-400">-{item.monthlyLossFormatted}</div>
                <div className="text-xs text-white/40">estimated monthly bleed</div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── 4. Quick Wins vs Strategic Fixes ──────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Wins (Do This Week) */}
          <div className="p-6 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">⚡</span>
              <h3 className="text-lg font-bold text-emerald-400">Quick Wins (Do This Week)</h3>
            </div>
            <p className="text-xs text-emerald-200/70 mb-4">
              High-leverage, fast-turnaround actions that immediate boost crawler visibility and trust:
            </p>
            <div className="space-y-3">
              {model.quickWins.map((qw, qIdx) => (
                <div key={qIdx} className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/20 text-xs">
                  <div className="font-bold text-white mb-1">• {qw.title}</div>
                  <div className="text-emerald-300/80">{qw.recommendedFix}</div>
                  <div className="mt-2 text-[11px] font-semibold text-emerald-400">Impact: +{qw.monthlyDollarFormatted}/mo recovered</div>
                </div>
              ))}
            </div>
          </div>

          {/* Strategic Fixes (Core Infrastructure) */}
          <div className="p-6 rounded-2xl bg-indigo-950/20 border border-indigo-500/30">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🏗️</span>
              <h3 className="text-lg font-bold text-indigo-400">Strategic Moats (Sprint Phases 2 & 3)</h3>
            </div>
            <p className="text-xs text-indigo-200/70 mb-4">
              Structural upgrades that create defensible ranking moats against local competitors:
            </p>
            <div className="space-y-3">
              {model.strategicFixes.slice(0, 3).map((sf, sIdx) => (
                <div key={sIdx} className="p-3.5 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-xs">
                  <div className="font-bold text-white mb-1">• {sf.title}</div>
                  <div className="text-indigo-300/80">{sf.recommendedFix}</div>
                  <div className="mt-2 text-[11px] font-semibold text-indigo-400">Protection: +{sf.monthlyDollarFormatted}/mo pipeline</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. What We Found (Ranked by Revenue Impact) ─────────── */}
      <section className="py-16 px-4 sm:px-6 bg-[#0f172a]/60 border-t border-b border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-wider text-[#4361ee]">Forensic Breakdown</span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">What We Found (Ranked by $ Impact)</h2>
            <p className="text-white/70 text-sm mt-1">
              Every finding sorted strictly by estimated revenue recovery and conversion impact.
            </p>
          </div>

          <div className="space-y-3">
            {model.rankedFindings.map((f, idx) => {
              const isOpen = expandedFinding === f.id;
              return (
                <div
                  key={f.id || idx}
                  className="rounded-xl border border-white/10 bg-[#0f172a] overflow-hidden transition-all hover:border-white/20"
                >
                  <button
                    onClick={() => toggleFinding(f.id)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left cursor-pointer"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                          f.severity === 'Critical'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : f.severity === 'High'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        }`}
                      >
                        {f.severity}
                      </span>
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">{f.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-extrabold text-sm sm:text-base text-rose-400">
                        -{f.monthlyDollarFormatted}/mo
                      </span>
                      <svg
                        className={`w-4 h-4 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-1 border-t border-white/10 bg-black/20 space-y-3 text-xs">
                      <div>
                        <span className="font-bold text-white/50 uppercase text-[10px] tracking-wider">Observation:</span>
                        <p className="text-white/80 mt-1 leading-relaxed">{f.description}</p>
                      </div>

                      {f.evidenceSnippets.length > 0 && (
                        <div>
                          <span className="font-bold text-white/50 uppercase text-[10px] tracking-wider">Audit Evidence:</span>
                          <div className="mt-1 p-2.5 rounded bg-black/40 border border-white/10 font-mono text-[11px] text-emerald-300 break-all">
                            {f.evidenceSnippets[0]}
                          </div>
                        </div>
                      )}

                      <div>
                        <span className="font-bold text-white/50 uppercase text-[10px] tracking-wider">Engineered Fix:</span>
                        <p className="text-emerald-400 mt-1 font-medium">{f.recommendedFix}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─── 5. The Phased Implementation Plan ──────────────────── */}
      <section className="py-16 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="mb-10 text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-[#4361ee]">Execution Roadmap</span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-1">The 14-Day Implementation Plan</h2>
          <p className="text-white/60 text-sm max-w-2xl mx-auto mt-2">
            Turnkey deployment with minimal client workload. We build, test, and verify every fix directly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {model.roadmap.map((phase) => (
            <div key={phase.phase} className="p-6 rounded-2xl bg-[#0f172a] border border-white/10 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <span className="w-7 h-7 rounded-full bg-[#4361ee] text-white font-black text-xs flex items-center justify-center">
                    0{phase.phase}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#4361ee]/20 text-[#38bdf8] border border-[#4361ee]/30">
                    {phase.timeline}
                  </span>
                </div>
                <h3 className="font-bold text-white text-base mb-3">{phase.name}</h3>
                <ul className="space-y-2 mb-4 text-xs text-white/70">
                  {phase.deliverables.map((d, dIdx) => (
                    <li key={dIdx} className="flex gap-2">
                      <span className="text-[#38bdf8] font-bold">✓</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-3 border-t border-white/10 text-[11px] text-white/50">
                <span className="font-bold text-white/80">Result: </span>
                {phase.impactSummary}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 6. Pricing (3 Tiers with Decoy Anchoring) ──────────── */}
      <section id="pricing" className="py-16 px-4 sm:px-6 bg-[#0f172a]/70 border-t border-b border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Guaranteed Sprint Pricing</span>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-1">Select Your Implementation Package</h2>
            <p className="text-white/60 text-sm max-w-xl mx-auto mt-2">
              Fixed-scope, fixed-price sprints backed by our 100% money-back guarantee.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch mb-12">
            {model.pricingTiers.map((tier) => (
              <div
                key={tier.id}
                className={`rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-all ${
                  tier.recommended
                    ? 'bg-gradient-to-b from-[#1e293b] to-[#0f172a] border-2 border-[#4361ee] shadow-2xl shadow-indigo-500/20 md:scale-105 z-10'
                    : 'bg-[#0f172a] border border-white/10'
                }`}
              >
                <div>
                  {tier.recommended && (
                    <div className="text-center -mt-10 mb-4">
                      <span className="px-4 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-[#4361ee] text-white shadow-lg">
                        RECOMMENDED • BEST VALUE
                      </span>
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                  <p className="text-xs text-white/60 mt-1 mb-4">{tier.tagline}</p>
                  <div className="mb-4">
                    <span className="text-4xl font-black text-white">{tier.priceFormatted}</span>
                    <span className="text-xs text-white/50 ml-1">one-time sprint</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-semibold mb-6 flex justify-between">
                    <span>Est. Recovery:</span>
                    <span>{tier.monthlyRoiFormatted}</span>
                  </div>

                  <ul className="space-y-2.5 mb-8 text-xs text-white/80">
                    {tier.features.map((feat, fIdx) => (
                      <li key={fIdx} className="flex gap-2 items-start">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => handleBookingClick('pricing_card', tier.id)}
                  className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    tier.recommended
                      ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white shadow-lg shadow-emerald-500/20 hover:scale-[1.02]'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  <span>Select {tier.name} & Book Call</span>
                  <span>→</span>
                </button>
              </div>
            ))}
          </div>

          {/* ─── 7. Risk Reversal Guarantee ──────────────────────── */}
          <div className="p-8 rounded-2xl bg-gradient-to-r from-purple-950/30 via-indigo-950/30 to-purple-950/30 border border-purple-500/30 mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-2xl shrink-0">
                🛡️
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {model.guarantee.badge}
                </span>
                <h3 className="text-xl font-black text-white mt-1">{model.guarantee.title}</h3>
              </div>
            </div>
            <p className="text-sm text-purple-200/90 leading-relaxed mb-4">
              {model.guarantee.summary}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-purple-200/80">
              {model.guarantee.terms.map((term, tIdx) => (
                <div key={tIdx} className="p-3 rounded-lg bg-black/20 border border-purple-500/20">
                  {term}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-4 italic">{model.guarantee.disclaimer}</p>
          </div>

          {/* ─── 8. Why This Works (Cited Industry Evidence) ───────── */}
          <div className="p-8 rounded-2xl bg-[#0f172a] border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="text-xs font-bold uppercase text-[#38bdf8] tracking-wider mb-1">
                Why This Works • Cited Industry Evidence ({model.whyThisWorks.citation})
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{model.whyThisWorks.headline}</h3>
              <p className="text-xs sm:text-sm text-white/70 mb-4 leading-relaxed">{model.whyThisWorks.context}</p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/5 border border-white/10 text-xs text-white/60">
                <span>Verified Metric:</span>
                <span className="font-bold text-emerald-400">{model.whyThisWorks.statHighlight}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 shrink-0 w-full md:w-auto">
              {model.whyThisWorks.metrics.map((m, mIdx) => (
                <div key={mIdx} className="p-3 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-lg font-black text-[#38bdf8]">{m.value}</div>
                  <div className="text-[10px] text-white/70">{m.label}</div>
                  <div className="text-[9px] text-white/40">{m.source}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Real Case Study (Only renders when verified client is present in config) */}
          {model.realCaseStudy && (
            <div className="mt-6 p-8 rounded-2xl bg-[#0f172a] border border-white/10">
              <div className="text-xs font-bold uppercase text-emerald-400 tracking-wider mb-1">
                Verified Client Brief • {model.realCaseStudy.clientName}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{model.realCaseStudy.headline}</h3>
              <p className="text-sm text-white/70 italic mb-3">"{model.realCaseStudy.quote}"</p>
              <div className="text-xs text-white/50">
                {model.realCaseStudy.author} — {model.realCaseStudy.role}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── 9. Single Global Bottom CTA ────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 text-center max-w-4xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
          Ready to Turn Findings into Bookings?
        </h2>
        <p className="text-base text-white/70 max-w-xl mx-auto mb-8">
          Lock in your reserved sprint pricing and walk through your implementation plan with a senior digital engineer.
        </p>
        <button
          onClick={() => handleBookingClick('bottom')}
          className="px-10 py-4 rounded-xl text-base sm:text-lg font-bold text-white bg-[#22c55e] hover:bg-[#16a34a] shadow-xl shadow-emerald-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer inline-flex items-center gap-2"
        >
          <span>{model.singleCtaText}</span>
          <span className="text-xl">→</span>
        </button>
        <div className="text-xs text-white/40 mt-3">
          15-minute screen share • No pressure • Direct engineering review
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────── */}
      <footer className="py-8 px-4 border-t border-white/10 bg-[#070d1e] text-center text-xs text-white/40 space-y-2">
        <div>
          Audit generated for <strong className="text-white/70">{model.businessName}</strong> ({model.businessCity}).
        </div>
        <div>
          © {new Date().getFullYear()} {brandName} ({model.brandDomain}). All rights reserved.
        </div>
      </footer>

      {/* ─── Sticky CTA Bar on Scroll ────────────────────────────── */}
      {showStickyBar && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 bg-[#0f172a]/95 backdrop-blur-md border-t border-white/10 shadow-2xl flex items-center justify-between gap-4 max-w-6xl mx-auto rounded-t-2xl sm:mb-2 sm:rounded-2xl sm:inset-x-4">
          <div className="hidden sm:block">
            <div className="text-sm font-bold text-white">{model.businessName} Audit</div>
            <div className="text-xs text-rose-400 font-semibold">Recover {model.hookHeader.totalMonthlyBleedFormatted}</div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="hidden md:inline text-xs text-amber-300 font-medium">
              Locked until {model.expiryDateFormatted}
            </span>
            <button
              onClick={() => handleBookingClick('sticky')}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-bold text-white bg-[#22c55e] hover:bg-[#16a34a] shadow-lg shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>{model.singleCtaText}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
