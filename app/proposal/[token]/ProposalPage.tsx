'use client';

import { useState } from 'react';

interface ProposalProps {
    proposal: {
        id: string;
        executiveSummary: string | null;
        painClusters: unknown;
        tierEssentials: unknown;
        tierGrowth: unknown;
        tierPremium: unknown;
        pricing: unknown;
        assumptions: string[];
        disclaimers: string[];
        nextSteps: string[];
        webLinkToken: string;
        createdAt: Date;
        audit: {
            businessName: string;
            businessCity: string | null;
            businessIndustry: string | null;
            findings: Array<{
                id: string;
                title: string;
                description: string | null;
                type: string;
                impactScore: number;
                module: string;
            }>;
        };
    };
}

interface Pricing {
    essentials: number;
    growth: number;
    premium: number;
}

interface Tier {
    name?: string;
    description?: string;
    findings?: string[];
    deliveryTime?: string;
}

export default function ProposalPage({ proposal }: ProposalProps) {
    const [selectedTier, setSelectedTier] = useState<string | null>(null);

    const pricing = proposal.pricing as Pricing;
    const tierEssentials = proposal.tierEssentials as Tier;
    const tierGrowth = proposal.tierGrowth as Tier;
    const tierPremium = proposal.tierPremium as Tier;

    const tiers = [
        {
            id: 'essentials',
            name: 'Essentials',
            price: pricing?.essentials || 450,
            description: tierEssentials?.description || 'Quick wins that deliver immediate impact',
            deliveryTime: tierEssentials?.deliveryTime || '1-2 weeks',
            findings: tierEssentials?.findings || [],
            recommended: false,
        },
        {
            id: 'growth',
            name: 'Growth',
            price: pricing?.growth || 1000,
            description: tierGrowth?.description || 'Comprehensive improvements for sustainable growth',
            deliveryTime: tierGrowth?.deliveryTime || '3-4 weeks',
            findings: tierGrowth?.findings || [],
            recommended: true,
        },
        {
            id: 'premium',
            name: 'Premium',
            price: pricing?.premium || 2000,
            description: tierPremium?.description || 'Complete transformation for maximum results',
            deliveryTime: tierPremium?.deliveryTime || '6-8 weeks',
            findings: tierPremium?.findings || [],
            recommended: false,
        },
    ];

    const painkillers = proposal.audit.findings.filter(f => f.type === 'PAINKILLER');
    const vitamins = proposal.audit.findings.filter(f => f.type === 'VITAMIN');

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                            ProposalOS
                        </h1>
                    </div>
                    <a
                        href={`/api/proposal/${proposal.webLinkToken}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download PDF
                    </a>
                </div>
            </header>

            {/* Hero Section */}
            <section className="py-16 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm mb-6">
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                        Prepared for {proposal.audit.businessName}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
                        Your Digital Presence
                        <span className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 bg-clip-text text-transparent">
                            Assessment Report
                        </span>
                    </h1>
                    <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                        {proposal.audit.businessCity && `Based in ${proposal.audit.businessCity}`}
                        {proposal.audit.businessIndustry && ` • ${proposal.audit.businessIndustry}`}
                    </p>
                </div>
            </section>

            {/* Executive Summary */}
            <section className="py-12 px-6 bg-slate-800/30">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                        <span className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </span>
                        Executive Summary
                    </h2>
                    <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
                        <p className="text-lg text-slate-300 leading-relaxed whitespace-pre-line">
                            {proposal.executiveSummary || 'No executive summary available.'}
                        </p>
                    </div>
                </div>
            </section>

            {/* Key Findings */}
            <section className="py-12 px-6">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                        <span className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </span>
                        Key Findings
                    </h2>

                    {/* Painkillers */}
                    {painkillers.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                                Urgent Issues ({painkillers.length})
                            </h3>
                            <div className="grid gap-4">
                                {painkillers.map((finding) => (
                                    <div
                                        key={finding.id}
                                        className="bg-slate-800/50 rounded-xl p-6 border border-red-500/20 hover:border-red-500/40 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-400 uppercase">
                                                        {finding.module}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${finding.impactScore >= 8 ? 'bg-red-500/20 text-red-400' :
                                                        finding.impactScore >= 5 ? 'bg-yellow-500/20 text-yellow-400' :
                                                            'bg-green-500/20 text-green-400'
                                                        }`}>
                                                        Impact: {finding.impactScore}/10
                                                    </span>
                                                </div>
                                                <h4 className="text-lg font-semibold text-white mb-2">{finding.title}</h4>
                                                <p className="text-slate-400">{finding.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Vitamins */}
                    {vitamins.length > 0 && (
                        <div>
                            <h3 className="text-lg font-semibold text-green-400 mb-4 flex items-center gap-2">
                                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                Growth Opportunities ({vitamins.length})
                            </h3>
                            <div className="grid gap-4">
                                {vitamins.map((finding) => (
                                    <div
                                        key={finding.id}
                                        className="bg-slate-800/50 rounded-xl p-6 border border-green-500/20 hover:border-green-500/40 transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-400 uppercase">
                                                        {finding.module}
                                                    </span>
                                                </div>
                                                <h4 className="text-lg font-semibold text-white mb-2">{finding.title}</h4>
                                                <p className="text-slate-400">{finding.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Pricing Tiers */}
            <section className="py-16 px-6 bg-gradient-to-b from-slate-800/30 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold mb-4">Choose Your Package</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto">
                            Select the package that best fits your goals and budget. All packages include ongoing support.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {tiers.map((tier) => (
                            <div
                                key={tier.id}
                                className={`relative bg-slate-800/50 rounded-2xl p-8 border transition-all cursor-pointer ${selectedTier === tier.id
                                    ? 'border-blue-500 ring-2 ring-blue-500/20'
                                    : tier.recommended
                                        ? 'border-blue-500/50'
                                        : 'border-slate-700/50 hover:border-slate-600'
                                    }`}
                                onClick={() => setSelectedTier(tier.id)}
                            >
                                {tier.recommended && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 rounded-full text-xs font-semibold">
                                        Recommended
                                    </div>
                                )}
                                <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                                <div className="flex items-baseline gap-1 mb-4">
                                    <span className="text-4xl font-bold">${tier.price.toLocaleString()}</span>
                                    <span className="text-slate-400">/project</span>
                                </div>
                                <p className="text-slate-400 text-sm mb-6">{tier.description}</p>
                                <div className="text-sm text-slate-500 mb-6">
                                    Delivery: {tier.deliveryTime}
                                </div>
                                <button
                                    className={`w-full py-3 rounded-xl font-semibold transition-colors ${tier.recommended
                                        ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                                        }`}
                                >
                                    Select {tier.name}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Next Steps */}
            {proposal.nextSteps.length > 0 && (
                <section className="py-12 px-6">
                    <div className="max-w-4xl mx-auto">
                        <h2 className="text-2xl font-bold mb-6">Next Steps</h2>
                        <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
                            <ol className="space-y-4">
                                {proposal.nextSteps.map((step, i) => (
                                    <li key={i} className="flex items-start gap-4">
                                        <span className="flex-shrink-0 w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-400 font-semibold">
                                            {i + 1}
                                        </span>
                                        <span className="text-slate-300 pt-1">{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </section>
            )}

            {/* Disclaimers */}
            {proposal.disclaimers.length > 0 && (
                <section className="py-8 px-6 border-t border-slate-800">
                    <div className="max-w-4xl mx-auto">
                        <p className="text-xs text-slate-500">
                            <strong>Disclaimers:</strong> {proposal.disclaimers.join(' ')}
                        </p>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="py-8 px-6 border-t border-slate-800 text-center">
                <p className="text-slate-500 text-sm">
                    Generated by ProposalOS • {new Date(proposal.createdAt).toLocaleDateString()}
                </p>
            </footer>
        </main>
    );
}
