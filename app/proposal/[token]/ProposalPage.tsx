'use client';

import { useState, useEffect, useRef } from 'react';
import { useProposalViewTracking } from './ProposalViewTracker';
import { loadStripe } from '@stripe/stripe-js';
import { ProposalShareButton } from '@/components/ProposalShareButton';
import { ProposalChatWidget } from '@/components/chat/ProposalChatWidget';

const NAVY = '#1a1a2e';
const BLUE = '#4361ee';
const WHITE = '#ffffff';
const ACCENT = '#22c55e'; // Green for CTA

interface FindingShape {
    id: string;
    impactScore: number;
    title: string;
    description?: string | null;
    recommendedFix?: unknown;
    evidence?: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ProposalProps {
    proposal: any;
    branding?: { name: string; logoUrl?: string | null };
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
    findingIds?: string[];
    deliveryTime?: string;
    features?: string[];
    badge?: string;
    visualEvidence?: { screenshotUrl: string; annotationText: string; findingRef: string; severity: number }[];
}

function formatScore(score: number | undefined | null): string {
    if (score == null) return '—';
    const s = Math.round(score);
    const emoji = s >= 90 ? '🟢' : s >= 70 ? '🟡' : s >= 50 ? '🟠' : '🔴';
    return `${s} ${emoji}`;
}

function extractScores(findings: { metrics?: Record<string, number> | null }[]): { performance: number; seo: number; accessibility: number } {
    let p = 0, s = 0, a = 0;
    let pC = 0, sC = 0, aC = 0;
    for (const f of findings) {
        const m = f.metrics || {};
        if (typeof m.performanceScore === 'number') { p += m.performanceScore; pC++; }
        if (typeof m.seoScore === 'number') { s += m.seoScore; sC++; }
        if (typeof m.accessibilityScore === 'number') { a += m.accessibilityScore; aC++; }
    }
    return {
        performance: pC ? Math.round(p / pC) : 0,
        seo: sC ? Math.round(s / sC) : 0,
        accessibility: aC ? Math.round(a / aC) : 0,
    };
}

function useFadeIn() {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ob = new IntersectionObserver(([e]) => e.isIntersecting && setIsVisible(true), { threshold: 0.1 });
        ob.observe(el);
        return () => ob.disconnect();
    }, []);
    return { ref, isVisible };
}

function AnimatedGauge({ score, label, delay = 0 }: { score: number; label: string; delay?: number }) {
    const [display, setDisplay] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ob = new IntersectionObserver(([e]) => {
            if (e.isIntersecting && !mounted) setMounted(true);
        }, { threshold: 0.3 });
        ob.observe(el);
        return () => ob.disconnect();
    }, [mounted]);

    useEffect(() => {
        if (!mounted) return;
        const t = setTimeout(() => {
            const dur = 1200;
            const step = 16;
            let t0 = Date.now();
            const tick = () => {
                const elapsed = Date.now() - t0;
                const pct = Math.min(1, elapsed / dur);
                const eased = 1 - Math.pow(1 - pct, 2);
                setDisplay(Math.round(score * eased));
                if (pct < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }, delay);
        return () => clearTimeout(t);
    }, [mounted, score, delay]);

    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
    const circumference = 2 * Math.PI * 45;
    const offset = circumference * (1 - (mounted ? display : 0) / 100);

    return (
        <div ref={ref} className="flex flex-col items-center">
            <div className="relative w-32 h-32 sm:w-40 sm:h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                    <circle
                        cx="50" cy="50" r="45"
                        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl sm:text-4xl font-bold" style={{ color }}>{display}</span>
                    <span className="text-xs text-white/60 mt-0.5">{label}</span>
                </div>
            </div>
        </div>
    );
}

const BEST_TIME_OPTIONS = [
    'Morning (9am–12pm)',
    'Afternoon (12pm–5pm)',
    'Evening (5pm–8pm)',
    'Anytime',
];

export default function ProposalPage({ proposal, branding }: ProposalProps) {
    const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
    const [isContactModalOpen, setIsContactModalOpen] = useState(false);
    const [urgencyBannerDismissed, setUrgencyBannerDismissed] = useState(false);
    const [tocOpen, setTocOpen] = useState(false);
    const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', preferredTier: '', bestTime: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [contactSuccess, setContactSuccess] = useState(false);

    const { trackCta, trackExpand } = useProposalViewTracking(proposal.webLinkToken);

    const pricing = (proposal.pricing || { essentials: 497, growth: 1497, premium: 2997 }) as Pricing;
    const tierEssentials = (proposal.tierEssentials || {}) as Tier;
    const tierGrowth = (proposal.tierGrowth || {}) as Tier;
    const tierPremium = (proposal.tierPremium || {}) as Tier;

    const tierFindings = (t: Tier) => t?.findingIds || t?.findings || [];
    const tiers = [
        { id: 'essentials', name: tierEssentials?.name || 'Starter', price: pricing?.essentials || 497, description: tierEssentials?.description || 'Quick wins only.', deliveryTime: tierEssentials?.deliveryTime || '5 business days', features: (tierEssentials as Tier)?.features || [], recommended: false, badge: (tierEssentials as Tier)?.badge },
        { id: 'growth', name: tierGrowth?.name || 'Growth', price: pricing?.growth || 1497, description: tierGrowth?.description || 'The full transformation — best value.', deliveryTime: tierGrowth?.deliveryTime || '10 business days', features: (tierGrowth as Tier)?.features || [], recommended: true, badge: (tierGrowth as Tier)?.badge || 'BEST VALUE' },
        { id: 'premium', name: tierPremium?.name || 'Premium', price: pricing?.premium || 2997, description: tierPremium?.description || 'Ongoing partnership.', deliveryTime: tierPremium?.deliveryTime || '15 business days', features: (tierPremium as Tier)?.features || [], recommended: false, badge: (tierPremium as Tier)?.badge },
    ];

    // Collect unique visual evidence from all tiers to display inline with findings
    const visualEvidenceMap = new Map<string, { screenshotUrl: string; annotationText: string; findingRef: string; severity: number }>();
    [tierEssentials, tierGrowth, tierPremium].forEach(t => {
        t.visualEvidence?.forEach(v => {
            if (!visualEvidenceMap.has(v.findingRef)) {
                visualEvidenceMap.set(v.findingRef, v);
            }
        });
    });

    const findings = proposal?.audit?.findings ?? [];
    const scores = extractScores(findings);
    const healthScore = findings.length
        ? Math.max(0, Math.min(100, Math.round(100 - (findings.reduce((s: number, f: { impactScore: number }) => s + f.impactScore, 0) / findings.length) * 8)))
        : 85;

    const comparisonReport = proposal.comparisonReport as {
        prospect: { name: string; performanceScore?: number; seoScore?: number; accessibilityScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number };
        competitors: Array<{ name: string; performanceScore?: number; seoScore?: number; accessibilityScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number }>;
        prospectRank: number;
        winningCategories: string[];
        losingCategories: string[];
        biggestGap: { category: string; prospectScore: number; bestCompetitorScore: number; competitorName: string; gap: number } | null;
        summaryStatement: string;
        positiveStatement: string;
        urgencyStatement: string;
        quickWins: Array<{ action: string; effortEstimate: string; expectedImpact: string }>;
        comparisonTableRows?: Array<{ metric: string; prospectValue: string | number; prospectStatus: string; competitorValues: Array<{ name: string; value: string | number; status: string }> }>;
        summaryRow?: string;
        whereAhead?: string[];
        whereBehind?: string[];
    } | null;

    type MatrixRow = { name: string; performanceScore?: number; seoScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number; websiteSpeed?: number };
    const matrixData = (() => {
        if (comparisonReport) {
            return {
                business: comparisonReport.prospect as MatrixRow,
                competitors: comparisonReport.competitors as MatrixRow[],
            };
        }
        const f = findings.find((x: { evidence?: unknown[] }) => (x.evidence as Array<{ matrix?: unknown; raw?: { matrix?: unknown } }>)?.some?.((e) => e.matrix || e.raw?.matrix));
        const firstEvidence = (f?.evidence as Array<{ matrix?: { business: MatrixRow; competitors: MatrixRow[] }; raw?: { matrix?: { business: MatrixRow; competitors: MatrixRow[] } } }>)?.[0];
        const m = firstEvidence?.matrix || firstEvidence?.raw?.matrix;
        return m;
    })();

    const auditDurationSeconds = (() => {
        const a = proposal.audit as { startedAt?: Date; completedAt?: Date | null };
        if (a.completedAt && a.startedAt) {
            return Math.round((new Date(a.completedAt).getTime() - new Date(a.startedAt).getTime()) / 1000);
        }
        return 45; // fallback
    })();

    const formatDate = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const openContactModal = () => {
        trackCta();
        setIsContactModalOpen(true);
    };

    const handleCheckout = async (tierId: string) => {
        trackCta();
        try {
            const res = await fetch('/api/billing/checkout-proposal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    proposalId: proposal.id,
                    tierId,
                    webLinkToken: proposal.webLinkToken
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to start checkout');

            // Redirect natively to Stripe hosted checkout rather than relying on Client-side SDK hooks
            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error("Missing checkout URL in response");
            }
        } catch (e: any) {
            console.error('Checkout error:', e);
            alert(e.message || 'Failed to start checkout. Please try again or contact support.');
        }
    };

    const submitContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const res = await fetch(`/api/proposal/${proposal.webLinkToken}/contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: contactForm.name.trim(),
                    email: contactForm.email.trim(),
                    phone: contactForm.phone.trim() || undefined,
                    preferredTier: contactForm.preferredTier || undefined,
                    bestTime: contactForm.bestTime || undefined,
                    message: contactForm.message.trim() || undefined,
                }),
            });
            if (res.ok) setContactSuccess(true);
            else alert('Something went wrong. Please try again.');
        } catch {
            alert('Error submitting. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleFinding = (id: string) => {
        const next = expandedFinding === id ? null : id;
        setExpandedFinding(next);
        if (next) trackExpand(next);
    };

    const heroRef = useFadeIn();
    const execRef = useFadeIn();
    const scoresRef = useFadeIn();
    const findingsRef = useFadeIn();
    const competitorRef = useFadeIn();
    const pricingRef = useFadeIn();
    const nextStepsRef = useFadeIn();
    const ctaRef = useFadeIn();

    const sectionClass = (ref: { ref: React.RefObject<HTMLDivElement>; isVisible: boolean }) =>
        `py-12 sm:py-16 px-4 sm:px-6 transition-all duration-700 ${ref.isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`;

    if (contactSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: NAVY }}>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl" style={{ backgroundColor: `${ACCENT}20`, color: ACCENT }}>✓</div>
                    <h1 className="text-2xl font-bold text-white mb-2">Thanks for Reaching Out!</h1>
                    <p className="text-white/70 mb-6">We&apos;ve received your details and will be in touch shortly.</p>
                    <button onClick={() => { setContactSuccess(false); setIsContactModalOpen(false); setContactForm({ name: '', email: '', phone: '', preferredTier: '', bestTime: '', message: '' }); }} className="px-6 py-3 rounded-xl font-semibold text-white" style={{ backgroundColor: ACCENT }}>Back to Proposal</button>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen text-white" style={{ backgroundColor: NAVY }}>
            <style>{`
                html { scroll-behavior: smooth; }
                .proposal-gauge-anim { animation: gauge-fill 1.2s ease-out forwards; }
                @keyframes gauge-fill { from { stroke-dashoffset: 283; } to { stroke-dashoffset: var(--offset); } }
            `}</style>

            {/* Contact Modal */}
            {isContactModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#16213e] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="p-6 sm:p-8">
                            <div className="flex justify-between items-start mb-6">
                                <h2 className="text-xl sm:text-2xl font-bold text-white">Let&apos;s Talk</h2>
                                <button onClick={() => setIsContactModalOpen(false)} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
                            </div>
                            <form onSubmit={submitContact} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-white/60 mb-1">Name *</label>
                                    <input required type="text" placeholder="Your name" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#4361ee] min-h-[44px]" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-white/60 mb-1">Email *</label>
                                    <input required type="email" placeholder="you@company.com" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#4361ee] min-h-[44px]" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-white/60 mb-1">Phone (optional)</label>
                                    <input type="tel" placeholder="(555) 123-4567" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#4361ee] min-h-[44px]" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-white/60 mb-1">Preferred tier</label>
                                    <select value={contactForm.preferredTier} onChange={e => setContactForm({ ...contactForm, preferredTier: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#4361ee] min-h-[44px]">
                                        <option value="">Select...</option>
                                        <option value="starter" className="bg-[#16213e]">Starter</option>
                                        <option value="growth" className="bg-[#16213e]">Growth</option>
                                        <option value="premium" className="bg-[#16213e]">Premium</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-white/60 mb-1">Best time to reach you</label>
                                    <select value={contactForm.bestTime} onChange={e => setContactForm({ ...contactForm, bestTime: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#4361ee] min-h-[44px]">
                                        <option value="">Select...</option>
                                        {BEST_TIME_OPTIONS.map(o => <option key={o} value={o} className="bg-[#16213e]">{o}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-white/60 mb-1">Message (optional)</label>
                                    <textarea placeholder="Any questions?" value={contactForm.message} onChange={e => setContactForm({ ...contactForm, message: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#4361ee] resize-none" />
                                </div>
                                <button type="submit" disabled={isSubmitting} className="w-full py-4 rounded-xl font-bold text-white transition-opacity disabled:opacity-50 min-h-[44px]" style={{ backgroundColor: ACCENT }}>
                                    {isSubmitting ? 'Sending...' : "I'm Interested — Let's Talk"}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky header area: urgency banner + nav */}
            <div className="sticky top-0 z-40 bg-[#1a1a2e]/95 backdrop-blur-md">
                {!urgencyBannerDismissed && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-500/15 border-b border-amber-500/30 text-amber-100/95 text-sm">
                        <p>
                            This audit reflects <strong>{proposal.audit.businessName}</strong>&apos;s website as of {formatDate((proposal.audit as { completedAt?: Date })?.completedAt || proposal.createdAt)}. Findings may change as competitors update their sites.
                        </p>
                        <button onClick={() => setUrgencyBannerDismissed(true)} className="flex-shrink-0 p-1 rounded hover:bg-amber-500/20 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Dismiss">×</button>
                    </div>
                )}
                <header className="border-b border-white/10">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
                        <span className="text-lg font-bold text-white">{branding?.name ?? 'ProposalOS'}</span>
                        <div className="flex items-center gap-2">
                            <a href={`/api/proposal/${proposal.webLinkToken}/pdf`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 min-h-[44px] min-w-[44px] justify-center" style={{ backgroundColor: BLUE }}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                <span className="hidden sm:inline">Download PDF</span>
                            </a>
                        </div>
                    </div>
                </header>
                <nav className="border-b border-white/5 py-3 px-4">
                    <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:flex-wrap sm:justify-center gap-2 sm:gap-4 text-sm">
                        <button onClick={() => setTocOpen(!tocOpen)} className="sm:hidden flex items-center gap-2 text-white/70 hover:text-white min-h-[44px] px-2" aria-expanded={tocOpen}>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            {tocOpen ? 'Hide' : 'Contents'}
                        </button>
                        {tocOpen && (
                            <div className="flex flex-wrap gap-2 sm:hidden">
                                {['executive-summary', 'scores', 'findings', 'competitors', 'pricing', 'next-steps', 'contact'].map(id => (
                                    <a key={id} href={`#${id}`} onClick={() => setTocOpen(false)} className="text-white/70 hover:text-white hover:underline px-2 py-1 rounded min-h-[44px] flex items-center">{id.replace(/-/g, ' ')}</a>
                                ))}
                            </div>
                        )}
                        <div className="hidden sm:flex flex-wrap justify-center gap-2 sm:gap-4">
                            {['executive-summary', 'scores', 'findings', 'competitors', 'pricing', 'next-steps', 'contact'].map(id => (
                                <a key={id} href={`#${id}`} className="text-white/70 hover:text-white hover:underline px-2 py-1 rounded min-h-[44px] flex items-center">{id.replace(/-/g, ' ')}</a>
                            ))}
                        </div>
                    </div>
                </nav>
            </div>

            {/* Hero */}
            <section ref={heroRef.ref} id="hero" className={`py-16 sm:py-24 px-4 sm:px-6 ${sectionClass(heroRef)}`}>
                <div className="max-w-5xl mx-auto text-center">
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-4">{proposal.audit.businessName}</h1>
                    <p className="text-white/70 text-lg mb-8">Digital Presence Audit</p>
                    <div className="flex justify-center">
                        <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                                <circle cx="50" cy="50" r="45" fill="none" stroke={BLUE} strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - healthScore / 100)} style={{ transition: 'stroke-dashoffset 1.2s ease-out' }} />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-5xl sm:text-6xl font-bold" style={{ color: BLUE }}>{healthScore}</span>
                                <span className="text-sm text-white/60 mt-1">Overall Score</span>
                            </div>
                        </div>
                    </div>
                    {(proposal.audit.businessCity || proposal.audit.businessIndustry) && (
                        <p className="text-white/50 text-sm mt-4">
                            {proposal.audit.businessCity}{proposal.audit.businessCity && proposal.audit.businessIndustry && ' • '}{proposal.audit.businessIndustry}
                        </p>
                    )}
                </div>
            </section>

            {/* Executive Summary */}
            {proposal.executiveSummary && (
                <section ref={execRef.ref} id="executive-summary" className={sectionClass(execRef)}>
                    <div className="max-w-5xl mx-auto">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: BLUE }}>Executive Summary</h2>
                        <p className="text-white/80 text-lg leading-relaxed">{proposal.executiveSummary}</p>
                    </div>
                </section>
            )}

            {/* Scores */}
            <section ref={scoresRef.ref} id="scores" className={sectionClass(scoresRef)}>
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Performance Scores</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6">
                        <AnimatedGauge score={healthScore} label="Health" delay={0} />
                        <AnimatedGauge score={scores.performance || 0} label="Performance" delay={100} />
                        <AnimatedGauge score={scores.seo || 0} label="SEO" delay={200} />
                        <AnimatedGauge score={scores.accessibility || 0} label="Accessibility" delay={300} />
                    </div>
                </div>
            </section>

            {/* Findings */}
            <section ref={findingsRef.ref} id="findings" className={sectionClass(findingsRef)}>
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl sm:text-3xl font-bold mb-8">Findings</h2>
                    <div className="space-y-3">
                        {findings.map((f: FindingShape) => {
                            const isExpanded = expandedFinding === f.id;
                            const severity = f.impactScore >= 8 ? 'Critical' : f.impactScore >= 6 ? 'High' : f.impactScore >= 4 ? 'Medium' : 'Low';
                            const severityColor = f.impactScore >= 8 ? '#ef4444' : f.impactScore >= 6 ? '#f97316' : f.impactScore >= 4 ? '#eab308' : '#22c55e';
                            return (
                                <div key={f.id} className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                                    <button onClick={() => toggleFinding(f.id)} className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 text-left min-h-[44px]">
                                        <div className="flex-1 min-w-0">
                                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold mb-2" style={{ backgroundColor: `${severityColor}30`, color: severityColor }}>{severity}</span>
                                            <h3 className="font-semibold text-white truncate">{f.title}</h3>
                                        </div>
                                        <svg className={`w-5 h-5 flex-shrink-0 text-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>
                                    {isExpanded && (
                                        <div className="px-4 sm:px-6 pb-4 border-t border-white/10">
                                            <p className="text-white/80 text-sm mt-4">{f.description}</p>

                                            {visualEvidenceMap.has(f.id) && (
                                                <div className="mt-4 rounded-lg overflow-hidden border border-white/10">
                                                    <img
                                                        src={visualEvidenceMap.get(f.id)!.screenshotUrl}
                                                        alt={visualEvidenceMap.get(f.id)!.annotationText}
                                                        className="w-full h-auto object-cover max-h-80"
                                                    />
                                                    <div className="bg-black/40 p-3 text-xs text-center text-white/80 italic font-medium">
                                                        {visualEvidenceMap.get(f.id)!.annotationText}
                                                    </div>
                                                </div>
                                            )}

                                            {Array.isArray(f.recommendedFix) && f.recommendedFix.length > 0 && (
                                                <div className="mt-4">
                                                    <p className="text-xs font-semibold text-white/60 mb-2">Recommended actions</p>
                                                    <ul className="space-y-1">
                                                        {(f.recommendedFix as string[]).map((fix, i) => <li key={i} className="flex gap-2 text-sm text-white/80"><span style={{ color: BLUE }}>→</span>{fix}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Competitor Comparison */}
            {(matrixData || comparisonReport) && (
                <section ref={competitorRef.ref} id="competitors" className={sectionClass(competitorRef)}>
                    <div className="max-w-5xl mx-auto space-y-8">
                        <h2 className="text-2xl sm:text-3xl font-bold">Competitive Intelligence</h2>

                        {comparisonReport && (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                                <p className="text-lg font-semibold text-white mb-2">
                                    You rank #{comparisonReport.prospectRank} out of {comparisonReport.competitors.length + 1} {proposal.audit.businessIndustry || 'business'}s in your area
                                </p>
                                <p className="text-white/80">{comparisonReport.summaryStatement}</p>
                                {comparisonReport.summaryRow && <p className="text-white font-semibold mt-2">{comparisonReport.summaryRow}</p>}
                            </div>
                        )}

                        {(comparisonReport?.comparisonTableRows?.length || matrixData) && (
                            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-white/10">
                                                <th className="p-4 text-left text-white/60 font-medium">Metric</th>
                                                <th className="p-4 text-center font-bold text-white" style={{ backgroundColor: `${BLUE}20` }}>{(comparisonReport?.prospect?.name || matrixData?.business?.name || proposal.audit.businessName) as string} (You)</th>
                                                {(comparisonReport?.comparisonTableRows?.[0]?.competitorValues?.map((c) => c.name) ?? matrixData?.competitors?.slice(0, 3).map((c: { name?: string }) => c.name) ?? []).map((name: string | undefined, i: number) => <th key={i} className="p-4 text-center text-white/70 font-medium border-l border-white/10">{name || `Competitor ${i + 1}`}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {comparisonReport?.comparisonTableRows?.map((row, i) => {
                                                const cellBg = (s: string) => s === 'win' ? 'rgba(34,197,94,0.2)' : s === 'lose' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.15)';
                                                return (
                                                    <tr key={i} className="group">
                                                        <td className="p-4 text-white/70" title={row.metric}>{row.metric}</td>
                                                        <td className="p-4 text-center font-bold border-l border-white/5 transition-colors group-hover:bg-white/5" style={{ backgroundColor: `${BLUE}10`, ...(cellBg(row.prospectStatus) ? { backgroundColor: cellBg(row.prospectStatus) } : {}) }} title={`You: ${row.prospectValue}`}>{row.prospectValue}</td>
                                                        {row.competitorValues.map((cv, j) => <td key={j} className="p-4 text-center text-white/60 border-l border-white/5 transition-colors hover:bg-white/5" style={{ backgroundColor: cellBg(cv.status) }} title={`${cv.name}: ${cv.value}`}>{cv.value}</td>)}
                                                    </tr>
                                                );
                                            })}
                                            {!comparisonReport?.comparisonTableRows?.length && matrixData && (
                                                <>
                                                    <tr><td className="p-4 text-white/70">PageSpeed</td><td className="p-4 text-center font-bold" style={{ backgroundColor: `${BLUE}10` }}>{formatScore(matrixData.business.performanceScore ?? matrixData.business.websiteSpeed)}</td>{matrixData.competitors.slice(0, 3).map((c: { performanceScore?: number; websiteSpeed?: number }, i: number) => <td key={i} className="p-4 text-center text-white/60 border-l border-white/5">{formatScore(c.performanceScore ?? c.websiteSpeed)}</td>)}</tr>
                                                    <tr><td className="p-4 text-white/70">Mobile Score</td><td className="p-4 text-center font-bold" style={{ backgroundColor: `${BLUE}10` }}>{formatScore(matrixData.business.mobileScore ?? matrixData.business.performanceScore)}</td>{matrixData.competitors.slice(0, 3).map((c: { mobileScore?: number; performanceScore?: number }, i: number) => <td key={i} className="p-4 text-center text-white/60 border-l border-white/5">{formatScore(c.mobileScore ?? c.performanceScore)}</td>)}</tr>
                                                    <tr><td className="p-4 text-white/70">Load Time</td><td className="p-4 text-center font-bold" style={{ backgroundColor: `${BLUE}10` }}>{matrixData.business.loadTimeSeconds != null ? `${matrixData.business.loadTimeSeconds}s` : '—'}</td>{matrixData.competitors.slice(0, 3).map((c: { loadTimeSeconds?: number }, i: number) => <td key={i} className="p-4 text-center text-white/60 border-l border-white/5">{c.loadTimeSeconds != null ? `${c.loadTimeSeconds}s` : '—'}</td>)}</tr>
                                                    <tr><td className="p-4 text-white/70">Google Rating</td><td className="p-4 text-center font-bold" style={{ backgroundColor: `${BLUE}10` }}>{matrixData.business.rating ?? '—'}★</td>{matrixData.competitors.slice(0, 3).map((c: { rating?: number }, i: number) => <td key={i} className="p-4 text-center text-white/60 border-l border-white/5">{c.rating ?? '—'}★</td>)}</tr>
                                                    <tr><td className="p-4 text-white/70">Reviews</td><td className="p-4 text-center font-bold" style={{ backgroundColor: `${BLUE}10` }}>{matrixData.business.reviewCount ?? '—'}</td>{matrixData.competitors.slice(0, 3).map((c: { reviewCount?: number }, i: number) => <td key={i} className="p-4 text-center text-white/60 border-l border-white/5">{c.reviewCount ?? '—'}</td>)}</tr>
                                                </>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-2 flex gap-4 text-xs text-white/50">
                                    <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ backgroundColor: 'rgba(34,197,94,0.5)' }} /> Winning</span>
                                    <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ backgroundColor: 'rgba(234,179,8,0.5)' }} /> Close</span>
                                    <span><span className="inline-block w-3 h-3 rounded mr-1" style={{ backgroundColor: 'rgba(239,68,68,0.5)' }} /> Behind</span>
                                </div>
                            </div>
                        )}

                        {comparisonReport && (comparisonReport.whereAhead?.length ?? comparisonReport.winningCategories?.length ?? 0) > 0 && (
                            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-6">
                                <h3 className="text-lg font-semibold text-green-400 mb-3">Where You&apos;re Ahead</h3>
                                {(comparisonReport.whereAhead?.length ?? 0) > 0 ? (
                                    <ul className="mt-2 space-y-2 text-white/90">
                                        {comparisonReport.whereAhead!.map((s, i) => <li key={i} className="flex items-center gap-2"><span className="text-green-400">✓</span>{s}</li>)}
                                    </ul>
                                ) : (
                                    <>
                                        <p className="text-white/90">{comparisonReport.positiveStatement}</p>
                                        <ul className="mt-2 space-y-1 text-white/80">
                                            {comparisonReport.winningCategories.map((cat, i) => <li key={i} className="flex items-center gap-2"><span className="text-green-400">✓</span>{cat}</li>)}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}

                        {comparisonReport && (comparisonReport.whereBehind?.length ?? comparisonReport.losingCategories?.length ?? 0) > 0 && (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                                <h3 className="text-lg font-semibold text-amber-400 mb-3">Where They&apos;re Beating You</h3>
                                {(comparisonReport.whereBehind?.length ?? 0) > 0 ? (
                                    <ul className="mt-2 space-y-2 text-white/90">
                                        {comparisonReport.whereBehind!.map((s, i) => <li key={i} className="flex items-center gap-2"><span className="text-amber-400">→</span>{s}</li>)}
                                    </ul>
                                ) : (
                                    <>
                                        <p className="text-white/90">{comparisonReport.urgencyStatement}</p>
                                        <ul className="mt-2 space-y-1 text-white/80">
                                            {comparisonReport.losingCategories.map((cat, i) => <li key={i} className="flex items-center gap-2"><span className="text-amber-400">→</span>{cat}</li>)}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}

                        {comparisonReport && comparisonReport.quickWins.length > 0 && (
                            <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                                <h3 className="text-lg font-semibold text-white mb-4">Quick Wins to Overtake</h3>
                                <ul className="space-y-3">
                                    {comparisonReport.quickWins.map((qw, i) => (
                                        <li key={i} className="flex flex-col gap-1">
                                            <span className="text-white font-medium">{qw.action}</span>
                                            <span className="text-white/60 text-sm">Effort: {qw.effortEstimate} • {qw.expectedImpact}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Pricing */}
            <section ref={pricingRef.ref} id="pricing" className={sectionClass(pricingRef)}>
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Choose Your Package</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                        {tiers.map(t => (
                            <div key={t.id} className={`rounded-2xl p-6 sm:p-8 border transition-all ${t.recommended ? 'border-[#4361ee] shadow-lg scale-[1.02] md:scale-105' : 'border-white/10 bg-white/5'}`}>
                                {(t.badge || (t.recommended && !t.badge)) && <div className="text-center -mt-8 mb-4"><span className="px-4 py-1 rounded-full text-xs font-bold uppercase" style={{ backgroundColor: BLUE }}>{t.badge || 'Recommended'}</span></div>}
                                <h3 className="text-xl font-bold text-white">{t.name}</h3>
                                <div className="mt-2 mb-4"><span className="text-3xl font-bold" style={{ color: BLUE }}>${t.price.toLocaleString()}</span><span className="text-white/50 text-sm">/project</span></div>
                                <p className="text-white/70 text-sm mb-4">{t.description}</p>
                                <p className="text-white/50 text-xs mb-6">Delivery: {t.deliveryTime}</p>
                                <ul className="space-y-2 mb-6">
                                    {t.features?.slice(0, 5).map((f, i) => <li key={i} className="flex gap-2 text-sm text-white/80"><span style={{ color: BLUE }}>✓</span>{f}</li>)}
                                </ul>
                                <button onClick={() => handleCheckout(t.id)} className="w-full py-4 rounded-xl font-bold text-white min-h-[44px]" style={{ backgroundColor: t.recommended ? ACCENT : 'rgba(255,255,255,0.15)' }}>Get Started</button>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Next Steps */}
            {Array.isArray(proposal.nextSteps) && proposal.nextSteps.length > 0 && (
                <section ref={nextStepsRef.ref} id="next-steps" className={sectionClass(nextStepsRef)}>
                    <div className="max-w-5xl mx-auto">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-6">Next Steps</h2>
                        <ol className="list-decimal list-inside space-y-3 text-white/80">
                            {proposal.nextSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                        </ol>
                    </div>
                </section>
            )}

            {/* CTA Section */}
            <section ref={ctaRef.ref} id="contact" className={`py-16 sm:py-24 px-4 sm:px-6 ${sectionClass(ctaRef)}`} style={{ background: `linear-gradient(180deg, transparent, ${BLUE}15)` }}>
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Get Started?</h2>
                    <p className="text-white/80 mb-8">Let&apos;s turn these findings into results for your business.</p>
                    <button onClick={openContactModal} className="px-8 py-4 rounded-xl font-bold text-white text-lg min-h-[44px]" style={{ backgroundColor: ACCENT }}>I&apos;m Interested — Let&apos;s Talk</button>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-8 px-4 border-t border-white/10">
                <div className="max-w-5xl mx-auto text-center space-y-4">
                    <p className="text-white/50 text-sm">This audit was performed on {formatDate(proposal.createdAt)}. Website conditions may have changed since then.</p>
                    <p className="text-white/40 text-xs">This audit was generated in {auditDurationSeconds} seconds using AI-powered analysis.</p>
                    {Array.isArray(proposal.disclaimers) && proposal.disclaimers.length > 0 && <p className="text-white/40 text-xs">{proposal.disclaimers.join(' ')}</p>}
                    <p className="text-white/30 text-xs">© {new Date().getFullYear()} ProposalOS. All rights reserved.</p>
                </div>
            </footer>

            {/* Sticky Mobile CTA */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 p-4 bg-[#1a1a2e]/98 border-t border-white/10">
                <button onClick={openContactModal} className="w-full py-4 rounded-xl font-bold text-white min-h-[44px]" style={{ backgroundColor: ACCENT }}>I&apos;m Interested — Let&apos;s Talk</button>
            </div>
            <div className="md:hidden h-20" />

            <ProposalShareButton proposalId={proposal.id} businessName={proposal.audit.businessName} token={proposal.webLinkToken} />

            {/* AI Sales Chat Widget */}
            <ProposalChatWidget proposalId={proposal.id} />
        </main>
    );
}
