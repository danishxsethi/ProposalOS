"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Play, Star } from 'lucide-react';
import { useState } from 'react';

const testimonials = [
    {
        quote: "Claraud found 14 issues on our site we had no idea about. We fixed the top 3 and saw a 40% jump in leads within 6 weeks.",
        name: "Sarah Chen",
        business: "Family Dental Clinic, Vancouver",
        stars: 5
    },
    {
        quote: "Our Google Business Profile was missing 60% of the info. After the audit fix, we went from 8 to 31 calls per week. Insane.",
        name: "Marcus Rivera",
        business: "HVAC Pro Services, Austin",
        stars: 5
    },
    {
        quote: "The competitor analysis alone was worth it. We identified 3 keywords our main rival dominated and closed the gap in 2 months.",
        name: "Priya Nair",
        business: "Immigration Law Associates, Toronto",
        stars: 5
    }
];

export function SocialProof() {
    const [videoPlaying, setVideoPlaying] = useState(false);

    return (
        <SectionWrapper id="social-proof" className="bg-bg-secondary/30">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center mb-12"
            >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                    See a real audit <span className="gradient-text">in action.</span>
                </h2>
            </motion.div>

            {/* Video Placeholder */}
            <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="max-w-4xl mx-auto mb-16 px-4"
            >
                <div
                    className="relative w-full aspect-video glass border border-white/10 rounded-2xl flex items-center justify-center cursor-pointer group overflow-hidden"
                    onClick={() => setVideoPlaying(true)}
                >
                    {/* Gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/10" />

                    {/* Grid lines decoration */}
                    <div className="absolute inset-0 opacity-5">
                        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <pattern id="vid-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#vid-grid)" />
                        </svg>
                    </div>

                    {/* Play button */}
                    <div className="relative z-10 flex flex-col items-center gap-5">
                        <div className="w-20 h-20 rounded-full gradient-btn flex items-center justify-center shadow-xl shadow-blue-500/30 group-hover:scale-110 transition-transform duration-300">
                            <Play className="w-8 h-8 text-white ml-1" fill="white" />
                        </div>
                        <p className="text-white font-medium text-lg">Watch 90-second demo</p>
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs font-mono px-2 py-1 rounded">
                        1:32
                    </div>
                </div>
            </motion.div>

            {/* Testimonials */}
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4"
            >
                {testimonials.map((t, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.45, delay: idx * 0.15 }}
                        className="glass rounded-2xl p-6 border border-white/10 flex flex-col gap-4"
                    >
                        <div className="flex gap-1">
                            {Array.from({ length: t.stars }).map((_, i) => (
                                <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            ))}
                        </div>
                        <p className="text-text-secondary text-sm leading-relaxed flex-1">
                            &ldquo;{t.quote}&rdquo;
                        </p>
                        <div className="pt-2 border-t border-white/10">
                            <p className="text-white text-sm font-semibold">{t.name}</p>
                            <p className="text-text-secondary text-xs mt-0.5">{t.business}</p>
                        </div>
                    </motion.div>
                ))}
            </motion.div>
        </SectionWrapper>
    );
}