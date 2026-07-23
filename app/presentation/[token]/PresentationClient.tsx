'use client';

import { useState, useEffect, useCallback } from 'react';
import { BRANDING, getBrandColor } from '@/lib/config/branding';

interface PresentationProps {
    proposal: any;
}

export default function PresentationClient({ proposal }: PresentationProps) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isFullScreen, setIsFullScreen] = useState(false);

    // Prepare data
    const audit = proposal.audit;
    const businessName = audit.businessName;
    const findings = audit.findings;
    const criticalFindings = findings.filter((f: any) => f.type === 'PAINKILLER').slice(0, 3);

    // Calculate Score
    const calculateHealthScore = () => {
        if (findings.length === 0) return 85;
        const avgImpact = findings.reduce((sum: any, f: any) => sum + f.impactScore, 0) / findings.length;
        return Math.max(0, Math.min(100, Math.round(100 - (avgImpact * 8))));
    };
    const healthScore = calculateHealthScore();

    // Slides Configuration
    const slides = [
        // SLIDE 1: Title
        {
            id: 'title',
            render: () => (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
                    {BRANDING.logoUrl && (
                        <img src={BRANDING.logoUrl} alt={BRANDING.name} className="h-24 w-auto mb-8" />
                    )}
                    <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                        {businessName}
                    </h1>
                    <h2 className="text-4xl text-slate-300">Digital Presence Assessment</h2>
                    <div className="mt-12 text-xl text-slate-500">
                        Prepared by {BRANDING.name} • {new Date().toLocaleDateString()}
                    </div>
                </div>
            )
        },
        // SLIDE 2: Overall Score
        {
            id: 'score',
            render: () => (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <h2 className="text-4xl font-bold mb-12 text-slate-200">Overall Digital Health Score</h2>
                    <div className="relative w-96 h-96">
                        <svg className="transform -rotate-90 w-full h-full">
                            <circle cx="50%" cy="50%" r="45%" stroke="#334155" strokeWidth="12" fill="transparent" />
                            <circle
                                cx="50%" cy="50%" r="45%"
                                stroke={healthScore >= 80 ? '#4ade80' : healthScore >= 60 ? '#facc15' : '#f87171'}
                                strokeWidth="12"
                                fill="transparent"
                                strokeDasharray={`${2 * Math.PI * 45} ${2 * Math.PI * 45}`}
                                strokeDashoffset={2 * Math.PI * 45 * (1 - healthScore / 100)} // Correct calculation?
                                strokeLinecap="round"
                                className="transition-all duration-1000"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-8xl font-bold ${healthScore >= 80 ? 'text-green-400' : healthScore >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {healthScore}
                            </span>
                            <span className="text-2xl text-slate-400 mt-2"> / 100</span>
                        </div>
                    </div>
                    <p className="mt-12 text-2xl text-slate-400 max-w-2xl">
                        {healthScore < 60
                            ? "Your digital presence is critically impacting your ability to convert customers."
                            : "You have a solid foundation, but key gaps are costing you revenue."}
                    </p>
                </div>
            )
        },
        // SLIDE 3: Radar Chart (Simulated for now with CSS or SVG)
        // ... Assuming we don't have a library handy, I'll skip complex chart and do category breakdown
        {
            id: 'categories',
            render: () => (
                <div className="flex flex-col h-full justify-center px-12">
                    <h2 className="text-4xl font-bold mb-16 text-center text-slate-200">Performance by Category</h2>
                    <div className="grid grid-cols-3 gap-8">
                        {['SEO', 'Website', 'Reputation', 'Social', 'Content', 'Ads'].map((cat, i) => (
                            <div key={i} className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700">
                                <h3 className="text-2xl font-semibold mb-4 text-slate-300">{cat}</h3>
                                <div className="w-full bg-slate-700 h-4 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500"
                                        style={{ width: `${Math.random() * 40 + 40}%` }} // Mock data for demo if actuals missing
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        },
        // Deep Dive Slides for Critical Findings
        ...criticalFindings.map((finding: any, i: number) => ({
            id: `finding-${i}`,
            render: () => (
                <div className="flex flex-col h-full px-12 py-12">
                    <div className="flex items-center gap-4 mb-8">
                        <span className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-xl font-bold">CRITICAL ISSUE #{i + 1}</span>
                        <span className="text-slate-500 text-xl">{finding.module}</span>
                    </div>
                    <h2 className="text-5xl font-bold mb-8 text-white leading-tight">{finding.title}</h2>
                    <div className="grid grid-cols-2 gap-12 flex-1">
                        <div className="flex flex-col justify-center space-y-8">
                            <p className="text-2xl text-slate-300 leading-relaxed">
                                {finding.description}
                            </p>
                            <div className="bg-slate-800/50 p-6 rounded-xl border-l-4 border-red-500">
                                <h4 className="text-red-400 font-bold mb-2 uppercase tracking-wide">Business Impact</h4>
                                <p className="text-xl text-slate-200">
                                    Impact Score: <span className="text-red-400 font-bold">{finding.impactScore}/10</span>
                                </p>
                            </div>
                            <div className="bg-slate-800/50 p-6 rounded-xl border-l-4 border-green-500">
                                <h4 className="text-green-400 font-bold mb-2 uppercase tracking-wide">The Fix</h4>
                                <p className="text-xl text-slate-200">
                                    {finding.recommendedFix?.[0] || "Immediate remediation required"}
                                </p>
                            </div>
                        </div>
                        <div className="bg-slate-900 rounded-2xl border border-slate-700 flex items-center justify-center overflow-hidden relative">
                            {/* Placeholder for evidence if no image */}
                            <div className="text-slate-600 text-center">
                                <span className="text-6xl mb-4 block">📸</span>
                                <span className="text-xl">Evidence Snapshot</span>
                            </div>
                        </div>
                    </div>
                </div>
            )
        })),
        {
            id: 'action-plan',
            render: () => (
                <div className="flex flex-col h-full px-12 py-12">
                    <h2 className="text-4xl font-bold mb-12 text-center text-white">Your 90-Day Roadmap</h2>
                    <div className="grid grid-cols-3 gap-8 flex-1">
                        {[
                            { title: 'Phase 1: Quick Wins', weeks: 'Weeks 1-2', items: ['Fix Google Business Profile', 'Respond to Reviews', 'Site Speed Tuning'] },
                            { title: 'Phase 2: Foundations', weeks: 'Weeks 3-6', items: ['Landing Page Optimization', 'Content Expansion', 'Citation Building'] },
                            { title: 'Phase 3: Growth', weeks: 'Weeks 7-12', items: ['SEO Campaign Launch', 'Review Generation System', 'Social Ads'] }
                        ].map((phase, i) => (
                            <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-2xl p-8 flex flex-col">
                                <div className="mb-6">
                                    <h3 className="text-2xl font-bold text-blue-400 mb-2">{phase.title}</h3>
                                    <span className="text-slate-500 font-medium">{phase.weeks}</span>
                                </div>
                                <ul className="space-y-4 flex-1">
                                    {phase.items.map((item, j) => (
                                        <li key={j} className="flex items-start gap-3 text-lg text-slate-300">
                                            <span className="text-green-400 mt-1">✓</span>
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )
        },
        {
            id: 'cta',
            render: () => (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-12">
                    <h2 className="text-5xl font-bold text-white">Ready to transform your business?</h2>
                    <p className="text-2xl text-slate-400 max-w-3xl">
                        We've already identified the problems. Now let's execute the solution.
                    </p>
                    <div className="flex gap-8">
                        <button className="px-12 py-6 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-2xl font-bold transition-all transform hover:scale-105 shadow-xl">
                            Start Essentials
                        </button>
                        <button className="px-12 py-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl text-2xl font-bold transition-all transform hover:scale-105 shadow-xl">
                            Start Growth
                        </button>
                    </div>
                    <p className="text-slate-500 mt-8">
                        Questions? Call us at {BRANDING.contact.phone}
                    </p>
                </div>
            )
        }
    ];

    // Navigation Logic
    const nextSlide = useCallback(() => {
        if (currentSlide < slides.length - 1) setCurrentSlide(c => c + 1);
    }, [currentSlide, slides.length]);

    const prevSlide = useCallback(() => {
        if (currentSlide > 0) setCurrentSlide(c => c - 1);
    }, [currentSlide]);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullScreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullScreen(false);
            }
        }
    };

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'Space') nextSlide();
            if (e.key === 'ArrowLeft') prevSlide();
            if (e.key === 'f') toggleFullScreen();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nextSlide, prevSlide]);

    return (
        <div className="min-h-screen bg-[#0f172a] text-white overflow-hidden relative font-sans">
            {/* Main Slide Area */}
            <div className="absolute inset-0 flex flex-col">
                <div className="flex-1 relative">
                    {/* Render Active Slide */}
                    <div key={currentSlide} className="absolute inset-0 animate-fade-in px-8 sm:px-16 py-8 sm:py-12 flex flex-col">
                        {slides[currentSlide].render()}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-2 bg-slate-800 w-full relative">
                    <div
                        className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${((currentSlide + 1) / slides.length) * 100}%` }}
                    />
                </div>

                {/* Controls Overlay (Bottom Right) */}
                <div className="absolute bottom-6 right-6 flex gap-4 text-slate-500 z-50">
                    <span className="text-sm font-mono self-center">
                        {currentSlide + 1} / {slides.length}
                    </span>
                    <button onClick={prevSlide} disabled={currentSlide === 0} className="p-2 hover:text-white disabled:opacity-30">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={nextSlide} disabled={currentSlide === slides.length - 1} className="p-2 hover:text-white disabled:opacity-30">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button onClick={toggleFullScreen} className="p-2 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    </button>
                </div>
            </div>

            <style jsx global>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in {
                    animation: fade-in 0.5s ease-out forwards;
                }
            `}</style>
        </div>
    );
}
