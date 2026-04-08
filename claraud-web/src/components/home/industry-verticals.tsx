"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { useRef } from 'react';
import Link from 'next/link';
import { industries } from '@/lib/industries';

export function IndustryVerticals() {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: 'left' | 'right') => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' });
    };

    return (
        <SectionWrapper id="industries">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center mb-12"
            >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                    Built for your industry.{" "}
                    <span className="gradient-text">Not generic advice.</span>
                </h2>
            </motion.div>

            <div className="relative max-w-6xl mx-auto px-4">
                {/* Left arrow */}
                <button
                    onClick={() => scroll('left')}
                    aria-label="Scroll left"
                    className="hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center glass border border-white/10 rounded-full hover:bg-white/10 transition-colors"
                >
                    <ChevronLeft className="w-6 h-6 text-white" />
                </button>

                {/* Scrollable carousel */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    ref={scrollRef}
                    className="flex gap-6 overflow-x-auto snap-x scroll-smooth pb-8"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {industries.map((industry, idx) => (
                        <Link
                            key={idx}
                            href={`/industries/${industry.slug}`}
                            className="flex-shrink-0 min-w-[280px] snap-start glass border border-white/10 rounded-2xl p-8 flex flex-col items-center text-center gap-4 card-hover group relative overflow-hidden h-full"
                        >
                            <div className="absolute top-0 right-0 p-3">
                                <span className="text-[10px] font-bold text-blue-500/50 uppercase tracking-widest">AVG {industry.avgScore}/10</span>
                            </div>
                            <span className="text-5xl mb-2">{industry.icon}</span>
                            <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{industry.name}</h3>
                            <div className="space-y-1">
                                <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold">Primary Gap</p>
                                <p className="text-xs text-text-primary font-medium px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">{industry.topIssue}</p>
                            </div>
                            <div className="pt-4 mt-auto">
                                <p className="text-sm font-semibold text-blue-400 group-hover:text-blue-300 transition-colors flex items-center gap-2">
                                    Industry Audit <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </p>
                            </div>
                        </Link>
                    ))}
                </motion.div>

                {/* Right arrow */}
                <button
                    onClick={() => scroll('right')}
                    aria-label="Scroll right"
                    className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 items-center justify-center glass border border-white/10 rounded-full hover:bg-white/10 transition-colors"
                >
                    <ChevronRight className="w-6 h-6 text-white" />
                </button>
            </div>
        </SectionWrapper>
    );
}
