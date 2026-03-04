"use client";

import { motion } from 'framer-motion';
import { ScanInput } from '@/components/scan/scan-input';
import { SectionWrapper } from '@/components/shared/section-wrapper';

export function Hero() {
    return (
        <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 pb-12 overflow-hidden">
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0f] via-[#0d1117] to-[#111827] pointer-events-none" />

            {/* Animated SVG Grid */}
            <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#hero-grid)">
                        <animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" />
                    </rect>
                </svg>
            </div>

            {/* Glowing orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="container relative z-10 px-4 md:px-6 flex flex-col items-center text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.05 }}
                    className="mb-4"
                >
                    <span className="inline-block px-4 py-1.5 glass border border-white/10 rounded-full text-sm text-text-secondary font-medium mb-6">
                        🚀 Free AI business audit — no signup required
                    </span>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.08]"
                >
                    <span className="block text-white">Your business has blind spots.</span>
                    <span className="block gradient-text mt-1">We find them in 30 seconds.</span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto mb-12 leading-relaxed"
                >
                    Claraud's AI engine audits your website, Google presence, competitors, reviews,
                    and social media — then builds you a personalized action plan to grow.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.3 }}
                    className="w-full max-w-xl mx-auto"
                >
                    <ScanInput variant="large" />
                </motion.div>

                {/* Sentinel for sticky bar observer */}
                <div id="hero-sentinel" className="mt-16 w-full" />

                {/* Trust Bar */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.7 }}
                    className="flex flex-col items-center border-t border-white/10 pt-10 w-full max-w-4xl mt-8"
                >
                    <p className="text-sm text-text-secondary mb-6 font-medium tracking-wide">
                        Trusted by <span className="text-white font-semibold">2,800+</span> businesses across North America
                    </p>
                    <div className="flex flex-wrap justify-center gap-6 md:gap-10 opacity-30 grayscale">
                        {[
                            "Apex Dental", "Riverfront Law", "CoolAir HVAC", "Bamboo Kitchen", "NorthPoint Realty", "FitCore"
                        ].map((biz) => (
                            <div
                                key={biz}
                                className="h-7 flex items-center justify-center bg-white/20 rounded px-4 text-xs font-semibold text-white tracking-wide"
                            >
                                {biz}
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}