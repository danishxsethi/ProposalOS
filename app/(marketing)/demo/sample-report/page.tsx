'use client';

import Link from 'next/link';

// Mock Data for Demo
const MOCK_PROPOSAL = {
  id: 'demo',
  businessName: 'Sample Local Services (fictional)',
  overallScore: 'EXAMPLE',
  findings: [
    {
      title: 'Example: verify the mobile contact path',
      type: 'PAINKILLER',
      category: 'CONVERSION',
      impactScore: 90,
    },
    {
      title: 'Example: verify service-area page coverage',
      type: 'PAINKILLER',
      category: 'LOCAL PRESENCE',
      impactScore: 85,
    },
    {
      title: 'Example: measure mobile performance before recommending changes',
      type: 'VITAMIN',
      category: 'PERFORMANCE',
      impactScore: 60,
    },
  ],
  sections: {
    intro:
      'Synthetic demo only. No real website was audited, and this page makes no claims about traffic, rankings, revenue, or results.',
    strategy:
      'For a real engagement, an operator would first collect dated evidence, verify each observation with the business, and agree on a feasible scope.',
    pricing: 'Not quoted in this synthetic demo',
  },
};

export default function SampleReportPage() {
  return (
    <div className="min-h-screen bg-slate-950 relative">
      {/* Watermark Overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center opacity-[0.03] overflow-hidden select-none">
        <div className="text-[20vw] font-black -rotate-12 text-white whitespace-nowrap">
          SAMPLE REPORT
        </div>
      </div>

      {/* Persistent CTA Header */}
      <div className="sticky top-16 z-40 bg-indigo-600 text-white p-3 text-center font-bold shadow-lg flex items-center justify-center gap-4">
        <span>Like what you see? Run this audit on your own business.</span>
        <Link
          href="/free-audit"
          className="bg-white text-indigo-700 px-4 py-1 rounded text-sm hover:bg-indigo-50 transition"
        >
          Try Free
        </Link>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="border-b border-amber-500/40 bg-amber-950/40 px-8 py-4 text-sm font-semibold text-amber-200">
            Synthetic demonstration — no real business, website, or audit data
          </div>
          {/* Synthetic proposal-viewer example */}
          <div className="p-8 border-b border-slate-800">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-3xl font-bold text-white">
                  Digital Audit: {MOCK_PROPOSAL.businessName}
                </h1>
                <p className="text-slate-400">Prepared by ProposalOS Demo Team</p>
              </div>
              <div className="w-20 h-20 rounded-full border-4 border-red-500 flex items-center justify-center text-2xl font-black text-white bg-slate-800">
                {MOCK_PROPOSAL.overallScore}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {MOCK_PROPOSAL.findings.map((f, i) => (
                <div key={i} className="bg-slate-950 p-4 rounded-lg border border-slate-800">
                  <div className="text-xs font-bold text-slate-500 mb-2">{f.category}</div>
                  <h3 className="text-white font-medium">{f.title}</h3>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 bg-slate-950">
            <h2 className="text-xl font-bold text-white mb-4">Strategic Recommendation</h2>
            <div className="prose prose-invert max-w-none text-slate-400">
              <p className="mb-4">{MOCK_PROPOSAL.sections.intro}</p>
              <p>{MOCK_PROPOSAL.sections.strategy}</p>
            </div>

            <div className="mt-12 p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
              <h3 className="text-lg font-bold text-white mb-2">Pricing</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white">{MOCK_PROPOSAL.sections.pricing}</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                A real proposal requires verified evidence, an agreed scope, and an approved price.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
