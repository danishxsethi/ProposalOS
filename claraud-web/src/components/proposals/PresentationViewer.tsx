"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Maximize, Play, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
    proposal: any;
    branding: any;
}

export default function PresentationViewer({ proposal, branding }: Props) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const slides = [
        { id: "title", type: "title" },
        { id: "executive", type: "executive" },
        { id: "findings", type: "findings" },
        { id: "solution", type: "solution" },
        { id: "pricing", type: "pricing" },
        { id: "next-steps", type: "next-steps" }
    ];

    const nextSlide = () => setCurrentSlide(prev => Math.min(prev + 1, slides.length - 1));
    const prevSlide = () => setCurrentSlide(prev => Math.max(prev - 1, 0));

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") nextSlide();
            if (e.key === "ArrowLeft") prevSlide();
            if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFullscreen]);

    const primaryColor = branding?.primaryColor || "#8B5CF6";
    const agencyName = branding?.brandName || "Our Agency";

    // Slide Animations
    const slideVariants = {
        enter: (direction: number) => ({ x: direction > 0 ? 1000 : -1000, opacity: 0 }),
        center: { zIndex: 1, x: 0, opacity: 1 },
        exit: (direction: number) => ({ zIndex: 0, x: direction < 0 ? 1000 : -1000, opacity: 0 }),
    };

    return (
        <div className={`fixed inset-0 bg-black flex flex-col \${isFullscreen ? "z-[9999]" : "z-50 mt-16"}`}>
            {/* Header / Controls */}
            <div className="absolute top-0 inset-x-0 z-50 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
                <div className="text-white/60 font-medium text-sm flex items-center gap-2">
                    <span className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-full">{currentSlide + 1}</span>
                    <span>/</span>
                    <span>{slides.length}</span>
                </div>
                <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsFullscreen(!isFullscreen)}>
                        <Maximize className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => window.close()}>
                        <X className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Slide Area */}
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                <AnimatePresence initial={false} custom={1}>
                    <motion.div
                        key={currentSlide}
                        custom={1}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ x: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
                        className="absolute inset-0 flex items-center justify-center p-8 md:p-16"
                    >
                        <div className="w-full max-w-6xl aspect-video bg-[#111111] rounded-2xl shadow-2xl border border-white/10 overflow-hidden relative flex flex-col">
                            
                            {/* Title Slide */}
                            {slides[currentSlide].type === "title" && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 relative overflow-hidden">
                                    <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at center, \${primaryColor}, transparent 70%)` }} />
                                    <h2 className="text-xl md:text-2xl font-medium text-text-secondary tracking-widest uppercase mb-4 z-10">Strategic Audit & Proposal</h2>
                                    <h1 className="text-5xl md:text-7xl font-bold text-white mb-8 z-10">{proposal.audit.businessName}</h1>
                                    <div className="w-16 h-1 bg-white/20 mb-8 z-10 rounded-full overflow-hidden">
                                        <div className="h-full" style={{ backgroundColor: primaryColor, width: '100%' }} />
                                    </div>
                                    <p className="text-xl text-text-secondary z-10">Prepared by {agencyName}</p>
                                </div>
                            )}

                            {/* Executive Summary */}
                            {slides[currentSlide].type === "executive" && (
                                <div className="flex-1 flex flex-col p-12 md:p-20">
                                    <h2 className="text-4xl font-bold text-white mb-8" style={{ color: primaryColor }}>Executive Summary</h2>
                                    <div className="text-2xl text-text-secondary leading-relaxed bg-white/5 p-10 rounded-2xl border border-white/10 flex-1">
                                        {proposal.executiveSummary || "Based on our comprehensive analysis, we have identified key areas of opportunity to enhance your digital presence, improve performance, and drive measurable revenue growth."}
                                    </div>
                                </div>
                            )}

                            {/* Findings */}
                            {slides[currentSlide].type === "findings" && (
                                <div className="flex-1 flex flex-col p-12 md:p-20">
                                    <h2 className="text-4xl font-bold text-white mb-8">Key Findings</h2>
                                    <div className="grid grid-cols-2 gap-6 flex-1">
                                        {proposal.audit.findings?.slice(0, 4).map((finding: any, idx: number) => (
                                            <div key={idx} className="bg-white/5 border border-white/10 p-6 rounded-xl flex flex-col">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-red-500/20 text-red-500 font-bold">
                                                        {finding.impactScore}
                                                    </div>
                                                    <h3 className="text-xl font-bold text-white">{finding.title}</h3>
                                                </div>
                                                <p className="text-text-secondary text-lg flex-1">{finding.description}</p>
                                            </div>
                                        )) || (
                                            <div className="col-span-2 flex items-center justify-center text-text-secondary">No findings recorded.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                             {/* Solution / Tiers */}
                             {slides[currentSlide].type === "solution" && (
                                <div className="flex-1 flex flex-col p-12 md:p-20">
                                    <h2 className="text-4xl font-bold text-white mb-4 text-center">The Solution</h2>
                                    <p className="text-xl text-text-secondary text-center mb-12">Tailored approaches to achieve your specific goals.</p>
                                    <div className="grid grid-cols-3 gap-8 flex-1">
                                        {/* Starter */}
                                        <div className="bg-white/5 border border-white/10 p-8 rounded-2xl flex flex-col">
                                            <h3 className="text-2xl font-bold text-white mb-2">Essentials</h3>
                                            <p className="text-text-secondary mb-6">Foundational improvements.</p>
                                            <ul className="space-y-3 flex-1">
                                                {(proposal.tierEssentials as any)?.features?.map((f: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-white/80">
                                                        <CheckCircle className="w-5 h-5 text-gray-400 shrink-0" /> {f}
                                                    </li>
                                                )) || <li className="text-white/50">Details pending...</li>}
                                            </ul>
                                        </div>
                                        
                                        {/* Growth */}
                                        <div className="bg-accent-primary/10 border border-accent-primary/50 p-8 rounded-2xl flex flex-col transform scale-105 shadow-2xl relative">
                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-accent-primary text-white px-4 py-1 rounded-full text-sm font-bold">RECOMMENDED</div>
                                            <h3 className="text-2xl font-bold text-white mb-2" style={{ color: primaryColor }}>Growth</h3>
                                            <p className="text-white/70 mb-6">Comprehensive optimization.</p>
                                            <ul className="space-y-3 flex-1">
                                                {(proposal.tierGrowth as any)?.features?.map((f: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-white">
                                                        <CheckCircle className="w-5 h-5 text-accent-primary shrink-0" /> {f}
                                                    </li>
                                                )) || <li className="text-white/50">Details pending...</li>}
                                            </ul>
                                        </div>

                                        {/* Premium */}
                                        <div className="bg-white/5 border border-white/10 p-8 rounded-2xl flex flex-col">
                                            <h3 className="text-2xl font-bold text-white mb-2">Premium</h3>
                                            <p className="text-text-secondary mb-6">Maximum competitive advantage.</p>
                                            <ul className="space-y-3 flex-1">
                                                {(proposal.tierPremium as any)?.features?.map((f: string, i: number) => (
                                                    <li key={i} className="flex items-start gap-2 text-white/80">
                                                        <CheckCircle className="w-5 h-5 text-blue-400 shrink-0" /> {f}
                                                    </li>
                                                )) || <li className="text-white/50">Details pending...</li>}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}

                             {/* Pricing */}
                             {slides[currentSlide].type === "pricing" && (
                                <div className="flex-1 flex flex-col p-12 md:p-20 items-center justify-center">
                                    <h2 className="text-5xl font-bold text-white mb-16">Investment Options</h2>
                                    <div className="grid grid-cols-3 gap-12 w-full max-w-4xl">
                                        <div className="text-center">
                                            <h3 className="text-2xl text-text-secondary mb-4">Essentials</h3>
                                            <div className="text-5xl font-bold text-white">${(proposal.pricing as any)?.starter || 0}</div>
                                            <div className="text-sm text-text-secondary mt-2">/ month</div>
                                        </div>
                                        <div className="text-center p-8 rounded-2xl border border-accent-primary/30 relative">
                                            <div className="absolute inset-0 bg-accent-primary/5 rounded-2xl -z-10" />
                                            <h3 className="text-2xl" style={{ color: primaryColor }}>Growth</h3>
                                            <div className="text-6xl font-bold text-white my-4">${(proposal.pricing as any)?.growth || 0}</div>
                                            <div className="text-sm text-text-secondary">/ month</div>
                                        </div>
                                        <div className="text-center">
                                            <h3 className="text-2xl text-text-secondary mb-4">Premium</h3>
                                            <div className="text-5xl font-bold text-white">${(proposal.pricing as any)?.premium || 0}</div>
                                            <div className="text-sm text-text-secondary mt-2">/ month</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Next Steps */}
                            {slides[currentSlide].type === "next-steps" && (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-12 relative overflow-hidden">
                                     <h2 className="text-6xl font-bold text-white mb-8">Ready to move forward?</h2>
                                     <p className="text-2xl text-text-secondary mb-12 max-w-2xl">
                                        Choose your desired tier and sign the agreement to kick off the partnership and begin onboarding.
                                     </p>
                                     <Button size="lg" className="bg-accent-primary hover:bg-accent-primary/90 text-white text-xl px-12 py-8 rounded-full shadow-2xl shadow-accent-primary/30" onClick={() => window.location.href = `/proposal/\${proposal.webLinkToken}`}>
                                        Open Checkout
                                     </Button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>

                {/* Left/Right Click Zones */}
                <div className="absolute inset-y-0 left-0 w-1/6 cursor-w-resize z-40 hidden md:block" onClick={prevSlide} />
                <div className="absolute inset-y-0 right-0 w-1/6 cursor-e-resize z-40 hidden md:block" onClick={nextSlide} />
            </div>

            {/* Bottom Controls */}
            <div className="h-20 bg-black/50 z-50 flex items-center justify-center gap-6 p-4">
                <Button variant="outline" size="lg" className="bg-transparent border-white/20 text-white hover:bg-white/10 rounded-full w-14 h-14 p-0" onClick={prevSlide} disabled={currentSlide === 0}>
                    <ChevronLeft className="w-6 h-6" />
                </Button>
                
                <div className="flex gap-2">
                    {slides.map((_, i) => (
                        <button 
                            key={i} 
                            onClick={() => setCurrentSlide(i)}
                            className={`h-2 rounded-full transition-all \${i === currentSlide ? "w-8 bg-accent-primary" : "w-2 bg-white/20 hover:bg-white/40"}`}
                        />
                    ))}
                </div>

                <Button variant="outline" size="lg" className="bg-transparent border-white/20 text-white hover:bg-white/10 rounded-full w-14 h-14 p-0" onClick={nextSlide} disabled={currentSlide === slides.length - 1}>
                    <ChevronRight className="w-6 h-6" />
                </Button>
            </div>
        </div>
    );
}
