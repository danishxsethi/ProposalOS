'use client';

import { useState, useEffect, useRef } from 'react';

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
                metrics: any;
                recommendedFix: any;
                [key: string]: any;
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

// Animation hook using Intersection Observer
function useFadeIn() {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.1 }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => {
            if (ref.current) {
                observer.unobserve(ref.current);
            }
        };
    }, []);

    return { ref, isVisible };
}
import { BRANDING, getBrandColor } from '@/lib/config/branding';
import { ProposalShareButton } from '@/components/ProposalShareButton';

// ... (imports remain)

export default function ProposalPage({ proposal }: ProposalProps) {
    // ... (state and logic remain)

    // Dynamic styles for branding
    const primaryStyle = { color: BRANDING.colors.primary };
    const bgPrimaryStyle = { backgroundColor: BRANDING.colors.primary };
    const borderPrimaryStyle = { borderColor: BRANDING.colors.primary };
    const gradientText = {
        backgroundImage: `linear-gradient(to right, ${BRANDING.colors.primary}, ${BRANDING.colors.accent})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    };

    // Template Logic
    const template = (proposal as any).template;

    // Custom CSS
    useEffect(() => {
        if (template?.customCss) {
            const style = document.createElement('style');
            style.innerHTML = template.customCss;
            document.head.appendChild(style);
            return () => {
                document.head.removeChild(style);
            };
        }
    }, [template]);

    // Content Overrides
    const replaceVariables = (text: string | null) => {
        if (!text) return null;

        const findingsCount = proposal.audit.findings.length;
        const painkillerCount = proposal.audit.findings.filter(f => f.type === 'PAINKILLER').length;
        const topIssue = proposal.audit.findings.sort((a, b) => b.impactScore - a.impactScore)[0]?.title || 'Critical Issue';

        const price = proposal.pricing as any;

        return text
            .replace(/{businessName}/g, proposal.audit.businessName)
            .replace(/{city}/g, proposal.audit.businessCity || 'your city')
            .replace(/{findingsCount}/g, findingsCount.toString())
            .replace(/{painkillerCount}/g, painkillerCount.toString())
            .replace(/{topIssue}/g, topIssue)
            .replace(/{essentialsPrice}/g, `$${price?.essentials || 450}`)
            .replace(/{growthPrice}/g, `$${price?.growth || 1000}`)
            .replace(/{premiumPrice}/g, `$${price?.premium || 2000}`);
    };

    const introText = replaceVariables(template?.introText); // If null, use default logic
    const outroText = replaceVariables(template?.outroText);
    const ctaText = template?.ctaText || 'Schedule Strategy Call';
    const ctaUrl = template?.ctaUrl || BRANDING.contact.website || '#';

    const showFindings = template?.showFindings ?? true;
    const showCompetitorMatrix = template?.showCompetitorMatrix ?? true;
    const showRoi = template?.showRoi ?? true;

    const [selectedTier, setSelectedTier] = useState<string | null>('growth');
    const [expandedVitamin, setExpandedVitamin] = useState<string | null>(null);

    const pricing = proposal.pricing as Pricing;
    const tierEssentials = proposal.tierEssentials as Tier;
    const tierGrowth = proposal.tierGrowth as Tier;
    const tierPremium = proposal.tierPremium as Tier;

    const tiers = [
        {
            id: 'essentials',
            name: 'Essentials',
            price: pricing?.essentials || 450,
            description: tierEssentials?.description || 'Fix the most critical issues affecting your business right now',
            deliveryTime: tierEssentials?.deliveryTime || '1-2 weeks',
            findings: tierEssentials?.findings || [],
            features: [
                'Fix top 3 critical issues',
                'Performance optimization',
                'Mobile responsiveness',
                'Basic SEO improvements',
                '2 weeks support',
            ],
        },
        {
            id: 'growth',
            name: 'Growth',
            price: pricing?.growth || 1000,
            description: tierGrowth?.description || 'Comprehensive improvements that drive sustainable growth',
            deliveryTime: tierGrowth?.deliveryTime || '3-4 weeks',
            findings: tierGrowth?.findings || [],
            features: [
                'Everything in Essentials',
                'Social media integration',
                'Review management setup',
                'Conversion optimization',
                'Competitor analysis',
                '30 days support',
            ],
            recommended: true,
        },
        {
            id: 'premium',
            name: 'Premium',
            price: pricing?.premium || 2000,
            description: tierPremium?.description || 'Complete digital transformation for maximum impact',
            deliveryTime: tierPremium?.deliveryTime || '6-8 weeks',
            findings: tierPremium?.findings || [],
            features: [
                'Everything in Growth',
                'Content strategy & creation',
                'Advanced analytics setup',
                'Marketing automation',
                'Ongoing optimization',
                '60 days priority support',
            ],
        },
    ];

    const painkillers = proposal.audit.findings
        .filter(f => f.type === 'PAINKILLER')
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, 5); // Top 5 most impactful

    const vitamins = proposal.audit.findings
        .filter(f => f.type === 'VITAMIN')
        .sort((a, b) => b.impactScore - a.impactScore);

    // Calculate overall health score (0-100)
    const calculateHealthScore = () => {
        const allFindings = proposal.audit.findings;
        if (allFindings.length === 0) return 85;

        const avgImpact = allFindings.reduce((sum, f) => sum + f.impactScore, 0) / allFindings.length;
        // Invert: higher impact = lower health score
        return Math.max(0, Math.min(100, Math.round(100 - (avgImpact * 8))));
    };

    const healthScore = calculateHealthScore();

    // Health score color
    const getHealthColor = (score: number) => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-yellow-400';
        if (score >= 40) return 'text-orange-400';
        return 'text-red-400';
    };

    const scrollToContact = () => {
        document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
    };

    const heroFade = useFadeIn();
    const urgencyFade = useFadeIn();
    const opportunityFade = useFadeIn();
    const pricingFade = useFadeIn();
    const socialProofFade = useFadeIn();
    const ctaFade = useFadeIn();

    const formatDate = (date: Date) => {
        return new Date(date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // State for Acceptance
    const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
    const [acceptSelectedTier, setAcceptSelectedTier] = useState<string | null>(null);
    const [formState, setFormState] = useState({ name: '', email: '', phone: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleAccept = (tier: string) => {
        setAcceptSelectedTier(tier);
        setIsAcceptModalOpen(true);
    };

    const submitAcceptance = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/proposal/${proposal.webLinkToken}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: acceptSelectedTier,
                    ...formState
                })
            });

            if (res.ok) {
                setIsSuccess(true);
                // Optional: Confetti or redirect
            } else {
                alert('Something went wrong. Please try again.');
            }
        } catch (err) {
            console.error(err);
            alert('Error submitting proposal.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="bg-slate-800 p-8 rounded-2xl max-w-md w-full text-center border border-slate-700">
                    <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
                        🎉
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">You're All Set!</h1>
                    <p className="text-slate-400 mb-6">
                        Thanks for accepting the proposal. We've received your details and will be in touch shortly to kick off the project.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-slate-700 text-white px-6 py-2 rounded-lg hover:bg-slate-600 transition"
                    >
                        View Proposal Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
            {/* Modal */}
            {isAcceptModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative animate-in fade-in zoom-in duration-300">
                        <button
                            onClick={() => setIsAcceptModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white"
                        >
                            ✕
                        </button>

                        <div className="p-6 md:p-8">
                            <h2 className="text-2xl font-bold text-white mb-1">Let's Get Started!</h2>
                            <p className="text-slate-400 text-sm mb-6">
                                You are accepting the <span className="text-indigo-400 font-semibold uppercase">{acceptSelectedTier}</span> plan.
                            </p>

                            <form onSubmit={submitAcceptance} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Full Name</label>
                                    <input
                                        required
                                        type="text"
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="John Doe"
                                        value={formState.name}
                                        onChange={e => setFormState({ ...formState, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Work Email</label>
                                    <input
                                        required
                                        type="email"
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="john@example.com"
                                        value={formState.email}
                                        onChange={e => setFormState({ ...formState, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Phone (Optional)</label>
                                    <input
                                        type="tel"
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-indigo-500"
                                        placeholder="(555) 123-4567"
                                        value={formState.phone}
                                        onChange={e => setFormState({ ...formState, phone: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1 uppercase">Message / Questions (Optional)</label>
                                    <textarea
                                        className="w-full bg-slate-800 border border-slate-700 rounded p-3 text-white focus:outline-none focus:border-indigo-500 h-24"
                                        placeholder="Any specific requests?"
                                        value={formState.message}
                                        onChange={e => setFormState({ ...formState, message: e.target.value })}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl mt-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? 'Processing...' : 'Confirm Acceptance'}
                                </button>

                                <p className="text-center text-xs text-slate-500 mt-4">
                                    By clicking confirm, you agree to move forward with this proposal. No payment is taken today.
                                </p>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {/* Header */}
            <header className="border-b border-slate-700/50 bg-slate-900/95 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        {BRANDING.logoUrl && (
                            <img src={BRANDING.logoUrl} alt={BRANDING.name} className="h-8 w-auto object-contain" />
                        )}
                        <h1 className="text-lg sm:text-xl font-bold" style={BRANDING.logoUrl ? {} : gradientText}>
                            {BRANDING.name}
                        </h1>
                    </div>
                    <a
                        href={`/api/proposal/${proposal.webLinkToken}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 hover:opacity-90"
                        style={{ backgroundColor: BRANDING.colors.primary }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span className="hidden sm:inline">Download PDF</span>
                        <span className="sm:hidden">PDF</span>
                    </a>
                </div>
            </header>

            {/* HERO SECTION */}
            <section ref={heroFade.ref} className={`py-12 sm:py-20 px-4 sm:px-6 transition-all duration-1000 ${heroFade.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-8 sm:mb-12">
                        <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-4 sm:mb-6">
                            {proposal.audit.businessName}
                        </h2>
                        <p className="text-lg sm:text-xl text-slate-300 mb-2">{BRANDING.tagline}</p>
                        <p className="text-sm text-slate-400">
                            Prepared for {proposal.audit.businessName} on {formatDate(proposal.createdAt)}
                        </p>
                    </div>

                    {/* Health Score Gauge */}
                    <div className="flex flex-col items-center mb-8">
                        <div className="relative w-48 h-48 sm:w-64 sm:h-64">
                            <svg className="transform -rotate-90 w-full h-full">
                                <circle
                                    cx="50%"
                                    cy="50%"
                                    r="45%"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    fill="transparent"
                                    className="text-slate-700"
                                />
                                <circle
                                    cx="50%"
                                    cy="50%"
                                    r="45%"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    fill="transparent"
                                    strokeDasharray={`${2 * Math.PI * 45} ${2 * Math.PI * 45}`}
                                    strokeDashoffset={2 * Math.PI * 45 * (1 - healthScore / 100)}
                                    className={`transition-all duration-1000 ease-out ${healthScore >= 80 ? 'text-green-400' : healthScore >= 60 ? 'text-yellow-400' : healthScore >= 40 ? 'text-orange-400' : 'text-red-400'}`}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className={`text-5xl sm:text-6xl font-bold ${getHealthColor(healthScore)}`}>
                                    {healthScore}
                                </span>
                                <span className="text-sm sm:text-base text-slate-400 mt-1">Health Score</span>
                            </div>
                        </div>
                    </div>

                    {/* Location/Industry */}
                    {(proposal.audit.businessCity || proposal.audit.businessIndustry) && (
                        <div className="text-center text-slate-400 text-sm sm:text-base">
                            {proposal.audit.businessCity && `${proposal.audit.businessCity}`}
                            {proposal.audit.businessCity && proposal.audit.businessIndustry && ' • '}
                            {proposal.audit.businessIndustry && proposal.audit.businessIndustry}
                        </div>
                    )}
                </div>
            </section>

            {/* URGENCY SECTION (Painkillers) */}
            {painkillers.length > 0 && (
                <section
                    ref={urgencyFade.ref}
                    className={`py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-br from-red-900/20 via-orange-900/20 to-red-900/20 border-y border-red-500/20 transition-all duration-1000 delay-200 ${urgencyFade.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                >
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center mb-8 sm:mb-12">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 text-red-400">
                                ⚠️ Issues Costing You Customers Right Now
                            </h2>
                            <p className="text-slate-300 text-sm sm:text-base">
                                These critical problems are actively hurting your business
                            </p>
                        </div>

                        <div className="grid gap-4 sm:gap-6">
                            {painkillers.map((finding, index) => {
                                // Extract key metric from metrics object
                                const getKeyMetric = () => {
                                    if (!finding.metrics) return null;
                                    const metrics = finding.metrics as any;

                                    if (metrics.performanceScore !== undefined) return `Page Speed: ${metrics.performanceScore}/100`;
                                    if (metrics.seoScore !== undefined) return `SEO: ${metrics.seoScore}/100`;
                                    if (metrics.rating !== undefined) return `Rating: ${metrics.rating}/5`;
                                    if (metrics.reviewCount !== undefined) return `Reviews: ${metrics.reviewCount}`;
                                    if (metrics.negativeRatio !== undefined) return `Negative: ${Math.round(metrics.negativeRatio * 100)}%`;

                                    return null;
                                };

                                const keyMetric = getKeyMetric();
                                const recommendedFix = Array.isArray(finding.recommendedFix)
                                    ? finding.recommendedFix
                                    : [];
                                const topFix = recommendedFix[0] || 'Immediate action required';

                                return (
                                    <div
                                        key={finding.id}
                                        className="bg-slate-800/80 rounded-xl p-4 sm:p-6 border border-red-500/30 hover:border-red-500/50 transition-all"
                                        style={{ animationDelay: `${index * 100}ms` }}
                                    >
                                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                                    <span className="px-2 py-1 bg-slate-700/50 rounded text-xs text-slate-400 uppercase">
                                                        {finding.module}
                                                    </span>
                                                    {keyMetric && (
                                                        <span className="px-2 py-1 bg-red-500/20 rounded text-xs text-red-300 font-semibold">
                                                            {keyMetric}
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">{finding.title}</h3>
                                                <p className="text-slate-300 text-sm sm:text-base mb-3">{finding.description}</p>
                                                <div className="flex items-start gap-2 text-sm text-amber-300">
                                                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                    <span className="font-medium">Quick fix: {topFix}</span>
                                                </div>
                                            </div>
                                            <div className="flex sm:flex-col items-center sm:items-end gap-2">
                                                {/* Impact Bar */}
                                                <div className="flex-1 sm:flex-initial">
                                                    <div className="text-xs text-slate-400 mb-1 text-right">Impact</div>
                                                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-1000"
                                                            style={{ width: `${(finding.impactScore / 10) * 100}%` }}
                                                        />
                                                    </div>
                                                    <div className="text-right text-xs text-red-400 font-bold mt-1">
                                                        {finding.impactScore}/10
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* COMPETITOR ANALYSIS SECTION */}
            {proposal.audit.findings.some(f => f.evidence?.some((e: any) => e.matrix)) && (
                <section className="py-12 sm:py-16 px-4 sm:px-6 bg-slate-800/20 border-y border-slate-700/50">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center mb-8 sm:mb-12">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 text-blue-400">
                                ⚔️ Competitive Landscape
                            </h2>
                            <p className="text-slate-300 text-sm sm:text-base">
                                See how you stack up against top local competitors
                            </p>
                        </div>

                        <div className="bg-slate-900/50 rounded-xl border border-slate-700 overflow-hidden">
                            {(() => {
                                const matrixFinding = proposal.audit.findings.find(f => f.evidence?.some((e: any) => e.matrix));
                                const matrix = matrixFinding?.evidence?.find((e: any) => e.matrix)?.matrix;

                                if (!matrix) return null;
                                const { business, competitors, gaps } = matrix;

                                return (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm sm:text-base">
                                            <thead>
                                                <tr className="bg-slate-800/50 text-slate-300">
                                                    <th className="p-4 text-left font-semibold">Metric</th>
                                                    <th className="p-4 text-center font-bold text-white border-l border-slate-700 bg-blue-500/10">
                                                        {business.name} (You)
                                                    </th>
                                                    {competitors.map((comp: any, i: number) => (
                                                        <th key={i} className="p-4 text-center font-semibold border-l border-slate-700 opacity-70">
                                                            {comp.name}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {/* Reviews */}
                                                <tr>
                                                    <td className="p-4 text-slate-300 font-medium">Reviews</td>
                                                    <td className="p-4 text-center font-bold bg-blue-500/5 border-l border-slate-700 text-white">
                                                        {business.reviewCount}
                                                    </td>
                                                    {competitors.map((comp: any, i: number) => (
                                                        <td key={i} className="p-4 text-center text-slate-400 border-l border-slate-700">
                                                            {comp.reviewCount}
                                                        </td>
                                                    ))}
                                                </tr>
                                                {/* Rating */}
                                                <tr>
                                                    <td className="p-4 text-slate-300 font-medium">Rating</td>
                                                    <td className="p-4 text-center font-bold bg-blue-500/5 border-l border-slate-700 text-white">
                                                        {business.rating} ★
                                                    </td>
                                                    {competitors.map((comp: any, i: number) => (
                                                        <td key={i} className="p-4 text-center text-slate-400 border-l border-slate-700">
                                                            {comp.rating} ★
                                                        </td>
                                                    ))}
                                                </tr>
                                                {/* Website Speed */}
                                                <tr>
                                                    <td className="p-4 text-slate-300 font-medium">Mobile Speed</td>
                                                    <td className="p-4 text-center font-bold bg-blue-500/5 border-l border-slate-700 text-white">
                                                        {business.websiteSpeed ? `${Math.round(business.websiteSpeed)}/100` : 'N/A'}
                                                    </td>
                                                    {competitors.map((comp: any, i: number) => (
                                                        <td key={i} className="p-4 text-center text-slate-400 border-l border-slate-700">
                                                            {comp.websiteSpeed ? `${Math.round(comp.websiteSpeed)}/100` : 'N/A'}
                                                        </td>
                                                    ))}
                                                </tr>
                                                {/* Photos */}
                                                <tr>
                                                    <td className="p-4 text-slate-300 font-medium">Photos</td>
                                                    <td className="p-4 text-center font-bold bg-blue-500/5 border-l border-slate-700 text-white">
                                                        {business.photosCount || 0}
                                                    </td>
                                                    {competitors.map((comp: any, i: number) => (
                                                        <td key={i} className="p-4 text-center text-slate-400 border-l border-slate-700">
                                                            {comp.photosCount || 0}
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Gaps Summary */}
                                        {gaps && gaps.length > 0 && (
                                            <div className="p-4 border-t border-slate-700 bg-slate-800/30">
                                                <h4 className="text-sm font-bold text-slate-300 mb-2">Analysis:</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {gaps.map((gap: any, i: number) => (
                                                        <span key={i} className={`text-xs px-2 py-1 rounded border ${gap.gap < 0 ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-green-500/10 border-green-500/30 text-green-300'}`}>
                                                            {gap.metric}: {gap.gap > 0 ? '+' : ''}{gap.gap} vs Avg
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </section>
            )}

            {/* OPPORTUNITY SECTION (Vitamins) */}
            {vitamins.length > 0 && (
                <section
                    ref={opportunityFade.ref}
                    className={`py-12 sm:py-16 px-4 sm:px-6 bg-gradient-to-br from-green-900/10 via-blue-900/10 to-green-900/10 transition-all duration-1000 delay-300 ${opportunityFade.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                >
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center mb-8 sm:mb-12">
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 text-green-400">
                                📈 Growth Opportunities
                            </h2>
                            <p className="text-slate-300 text-sm sm:text-base">
                                Improvements that will help you stand out from competitors
                            </p>
                        </div>

                        <div className="space-y-2">
                            {vitamins.map((finding) => {
                                const isExpanded = expandedVitamin === finding.id;

                                return (
                                    <div
                                        key={finding.id}
                                        className="bg-slate-800/50 rounded-lg border border-green-500/20 hover:border-green-500/40 transition-all overflow-hidden"
                                    >
                                        <button
                                            onClick={() => setExpandedVitamin(isExpanded ? null : finding.id)}
                                            className="w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4 text-left"
                                        >
                                            <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400 uppercase">
                                                        {finding.module}
                                                    </span>
                                                    <span className="px-2 py-0.5 bg-green-500/20 rounded text-xs text-green-400 font-semibold">
                                                        Impact: {finding.impactScore}/10
                                                    </span>
                                                </div>
                                                <h3 className="text-base sm:text-lg font-semibold text-white">{finding.title}</h3>
                                            </div>
                                            <svg
                                                className={`w-5 h-5 text-green-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isExpanded && (
                                            <div className="px-4 sm:px-6 pb-4 border-t border-green-500/10">
                                                <p className="text-slate-300 text-sm sm:text-base mb-3 mt-3">{finding.description}</p>
                                                {(() => {
                                                    const recommendedFix = Array.isArray(finding.recommendedFix)
                                                        ? finding.recommendedFix
                                                        : [];
                                                    return recommendedFix.length > 0 && (
                                                        <div className="mt-3">
                                                            <p className="text-xs text-slate-400 mb-2 font-semibold">Recommended Actions:</p>
                                                            <ul className="space-y-1">
                                                                {recommendedFix.map((fix: string, i: number) => (
                                                                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                                        <span className="text-green-400 mt-0.5">→</span>
                                                                        <span>{fix}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* FINDINGS SECTION */}
            {showFindings && (
                <div className="mb-12">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                        <span className="text-3xl">🔍</span> Key Findings
                    </h2>
                    <div className="space-y-4">
                        {proposal.audit.findings.slice(0, 5).map((finding, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${finding.type === 'PAINKILLER' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                            {finding.type}
                                        </span>
                                        <h3 className="font-bold text-slate-800">{finding.title}</h3>
                                    </div>
                                    <div className="text-red-500 font-bold bg-red-50 px-2 rounded">
                                        Impact: {finding.impactScore}/10
                                    </div>
                                </div>
                                <p className="text-slate-600 text-sm mb-3">
                                    {finding.description}
                                </p>
                                <div className="bg-slate-50 p-3 rounded text-sm text-slate-700 flex gap-2">
                                    <span>💡</span>
                                    <strong>Fix:</strong>
                                    {finding.recommendedFix && (finding.recommendedFix as any)[0] ? (finding.recommendedFix as any)[0] : 'Expert optimization required.'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* PRICING SECTION */}
            <section
                ref={pricingFade.ref}
                className={`py-12 sm:py-20 px-4 sm:px-6 bg-gradient-to-b from-slate-800/30 to-transparent transition-all duration-1000 delay-400 ${pricingFade.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            >
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-8 sm:mb-12">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">Choose Your Package</h2>
                        <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
                            Select the package that best fits your goals. All packages include ongoing support.
                        </p>
                        <p className="text-sm mt-2 font-semibold" style={{ color: BRANDING.colors.accent }}>
                            💰 Save 20% compared to hiring individual specialists
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
                        {tiers.map((tier) => (
                            <div
                                key={tier.id}
                                className={`relative bg-slate-800/50 rounded-2xl p-5 sm:p-8 border transition-all ${tier.recommended
                                    ? 'md:scale-105 shadow-xl'
                                    : 'border-slate-700/50 hover:border-slate-600'
                                    }`}
                                style={tier.recommended ? { borderColor: BRANDING.colors.primary, boxShadow: `0 20px 25px -5px ${getBrandColor(BRANDING.colors.primary, 0.1)}` } : {}}
                            >
                                {tier.recommended && (
                                    <div
                                        className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide text-white"
                                        style={{ background: `linear-gradient(to right, ${BRANDING.colors.primary}, ${BRANDING.colors.accent})` }}
                                    >
                                        Recommended
                                    </div>
                                )}

                                <h3 className="text-xl sm:text-2xl font-bold mb-2">{tier.name}</h3>
                                <div className="flex items-baseline gap-1 mb-4">
                                    <span className="text-3xl sm:text-4xl font-bold">${tier.price.toLocaleString()}</span>
                                    <span className="text-slate-400 text-sm">/project</span>
                                </div>
                                <p className="text-slate-400 text-sm mb-4">{tier.description}</p>
                                <div className="text-xs text-slate-500 mb-6">
                                    ⏱️ Delivery: {tier.deliveryTime}
                                </div>

                                <ul className="space-y-2 mb-6">
                                    {tier.features?.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: BRANDING.colors.accent }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={scrollToContact}
                                    className={`w-full py-3 rounded-xl font-semibold transition-all text-white`}
                                    style={
                                        tier.recommended
                                            ? { background: `linear-gradient(to right, ${BRANDING.colors.primary}, ${BRANDING.colors.accent})` }
                                            : { backgroundColor: '#334155' } // slate-700
                                    }
                                >
                                    Get Started
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* SOCIAL PROOF SECTION */}
            <section
                ref={socialProofFade.ref}
                className={`py-12 sm:py-16 px-4 sm:px-6 bg-slate-800/20 transition-all duration-1000 delay-500 ${socialProofFade.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
            >
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-8 sm:mb-12">
                        <p className="font-semibold mb-2 text-sm sm:text-base" style={{ color: BRANDING.colors.accent }}>Trusted by 50+ local businesses</p>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold">What Our Clients Say</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
                        {[
                            {
                                name: 'Sarah Johnson',
                                business: 'Urban Coffee Co.',
                                text: 'Our website traffic increased 150% in just two months. The team identified issues we didn\'t even know existed.',
                                rating: 5,
                            },
                            {
                                name: 'Mike Chen',
                                business: 'Chen\'s Auto Repair',
                                text: 'Finally showing up on Google! We went from invisible to the top 3 local results. Phone is ringing off the hook.',
                                rating: 5,
                            },
                            {
                                name: 'Jennifer Martinez',
                                business: 'Bella Salon & Spa',
                                text: 'The social media integration alone paid for itself. We\'re now getting 5-10 new bookings per week from Instagram.',
                                rating: 5,
                            },
                        ].map((testimonial, i) => (
                            <div key={i} className="bg-slate-800/50 rounded-xl p-5 sm:p-6 border border-slate-700/50">
                                <div className="flex gap-1 mb-3">
                                    {[...Array(testimonial.rating)].map((_, i) => (
                                        <svg key={i} className="w-5 h-5" style={{ color: BRANDING.colors.accent }} fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    ))}
                                </div>
                                <p className="text-slate-300 mb-4 text-sm sm:text-base">"{testimonial.text}"</p>
                                <div>
                                    <p className="font-semibold text-white text-sm">{testimonial.name}</p>
                                    <p className="text-slate-400 text-xs">{testimonial.business}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CONTACT/CTA SECTION */}
            <section
                id="contact"
                ref={ctaFade.ref}
                className={`py-12 sm:py-20 px-4 sm:px-6 transition-all duration-1000 delay-600 ${ctaFade.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
                style={{ background: `linear-gradient(to bottom right, ${getBrandColor(BRANDING.colors.primary, 0.2)}, ${getBrandColor(BRANDING.colors.accent, 0.2)}, ${getBrandColor(BRANDING.colors.primary, 0.2)})` }}
            >
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6">
                        Ready to Fix These Issues?
                    </h2>
                    <p className="text-lg sm:text-xl text-slate-300 mb-8 sm:mb-10">
                        Let's turn these findings into results for your business
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                        <a
                            href={BRANDING.contact.website || "https://calendly.com"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all shadow-lg hover:shadow-xl text-white"
                            style={{ background: `linear-gradient(to right, ${BRANDING.colors.primary}, ${BRANDING.colors.accent})` }}
                        >
                            📅 Schedule a 15-Minute Call
                        </a>
                        <a
                            href={`mailto:${BRANDING.contact.email || 'hello@proposalengine.com'}?subject=Proposal for ${proposal.audit.businessName}`}
                            className="px-6 sm:px-8 py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 rounded-xl font-semibold text-base sm:text-lg transition-all border border-slate-600"
                        >
                            ✉️ Reply to This Email
                        </a>
                    </div>

                    {BRANDING.contact.phone && (
                        <p className="text-slate-400 text-sm sm:text-base">
                            Or call us: <a href={`tel:${BRANDING.contact.phone}`} className="hover:underline font-semibold" style={{ color: BRANDING.colors.accent }}>{BRANDING.contact.phone}</a>
                        </p>
                    )}
                </div>
            </section>

            {/* FOOTER */}
            <footer className="py-8 px-4 sm:px-6 border-t border-slate-800 text-center">
                <div className="max-w-4xl mx-auto space-y-4">
                    <p className="text-slate-500 text-xs sm:text-sm">
                        This report was generated on {formatDate(proposal.createdAt)}. Data may change over time.
                    </p>
                    {proposal.disclaimers.length > 0 && (
                        <p className="text-slate-600 text-xs">
                            Findings are based on publicly available data and automated analysis.
                            {proposal.disclaimers.join(' ')}
                        </p>
                    )}
                    <p className="text-slate-600 text-xs">
                        {BRANDING.footerText}
                    </p>
                    {BRANDING.contact.website && (
                        <p>
                            <a href={BRANDING.contact.website} className="text-slate-600 text-xs hover:text-slate-400">
                                {BRANDING.contact.website}
                            </a>
                        </p>
                    )}
                    <div className="mt-20 text-center text-gray-500 dark:text-gray-400 text-sm">
                        © {new Date().getFullYear()} {BRANDING.name}. All rights reserved.
                    </div>
                </div>
            </footer>

            {/* Viral Sharing Button */}
            <ProposalShareButton
                proposalId={proposal.id}
                businessName={proposal.audit.businessName}
                token={proposal.webLinkToken}
            />
        </main>
    );
}
