"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import Link from 'next/link';

const industries = [
    { icon: "🦷", name: "Dentists", slug: "dentists" },
    { icon: "⚖️", name: "Law Firms", slug: "law-firms" },
    { icon: "🔧", name: "HVAC", slug: "hvac" },
    { icon: "🍕", name: "Restaurants", slug: "restaurants" },
    { icon: "🏠", name: "Real Estate", slug: "real-estate" },
    { icon: "💪", name: "Gyms", slug: "gyms" },
    { icon: "🐾", name: "Veterinary", slug: "veterinary" },
    { icon: "💇", name: "Salons", slug: "salons" },
    { icon: "🏗️", name: "Contractors", slug: "contractors" },
    { icon: "🛒", name: "Retail", slug: "retail" }
];

export function IndustryVerticals() {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: 'left' | 'right') => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollBy({ left: dir === 'right' ? 240 : -240, behavior: 'smooth' });
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
                    className="hidden md:flex absolute -left-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center glass border border-white/10 rounded-full hover:bg-white/10 transition-colors"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Scrollable carousel */}
                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    ref={scrollRef}
                    className="flex gap-4 overflow-x-auto snap-x scroll-smooth pb-4"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {industries.map((industry, idx) => (
                        <Link
                            key={idx}
                            href={`/industries/${industry.slug}`}
                            className="flex-shrink-0 min-w-[200px] snap-start glass border border-white/10 rounded-2xl p-6 flex flex-col items-center text-center gap-4 card-hover group"
                        >
                            <span className="text-4xl">{industry.icon}</span>
                            <h3 className="font-semibold text-white">{industry.name}</h3>
                            <p className="text-xs text-blue-400 group-hover:text-blue-300 transition-colors">
                                Get your {industry.name} audit &rarr;
                            </p>
                        </Link>
                    ))}
                </motion.div>

                {/* Right arrow */}
                <button
                    onClick={() => scroll('right')}
                    aria-label="Scroll right"
                    className="hidden md:flex absolute -right-6 top-1/2 -translate-y-1/2 z-10 w-10 h-10 items-center justify-center glass border border-white/10 rounded-full hover:bg-white/10 transition-colors"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>
        </SectionWrapper>
    );
}