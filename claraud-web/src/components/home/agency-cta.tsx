"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Link from 'next/link';

const valueProps = [
    "White-label everything — your logo, your brand",
    "Close 3x more deals with a leave-behind audit report",
    "Deliver client audits in hours, not weeks"
];

export function AgencyCta() {
    return (
        <SectionWrapper id="agencies" className="!py-0">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 border border-white/10 p-8 md:p-16">
                {/* Background decoration */}
                <div className="absolute inset-0 opacity-5 pointer-events-none">
                    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="agency-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#agency-grid)" />
                    </svg>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    {/* Left: Text */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-block mb-4 px-3 py-1 rounded-full glass border border-blue-500/30 text-blue-400 text-xs font-semibold uppercase tracking-wider">
                            For Agencies & Consultants
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                            Run this for your clients.{" "}
                            <span className="gradient-text">Under your brand.</span>
                        </h2>
                        <p className="text-text-secondary mb-8 leading-relaxed">
                            Agencies use Claraud to win more clients, deliver faster, and create recurring audit retainers.
                            White-label the platform and make it yours.
                        </p>
                        <ul className="space-y-4 mb-10">
                            {valueProps.map((prop, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-text-secondary">
                                    <div className="w-5 h-5 rounded-full gradient-btn flex-shrink-0 flex items-center justify-center mt-0.5">
                                        <Check className="w-3 h-3 text-white" />
                                    </div>
                                    {prop}
                                </li>
                            ))}
                        </ul>
                        <Button className="gradient-btn font-semibold px-8 py-6 text-base" asChild>
                            <Link href="/agencies">Explore the Agency Platform &rarr;</Link>
                        </Button>
                    </motion.div>

                    {/* Right: mockup */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.15 }}
                    >
                        <div className="glass border border-white/10 rounded-2xl p-6 space-y-4 shadow-2xl shadow-blue-500/5">
                            {/* Fake agency header */}
                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10">
                                <div className="h-6 w-28 bg-gradient-to-r from-blue-500/40 to-purple-500/40 rounded" />
                                <div className="text-xs text-text-secondary font-mono">Powered by YourAgency™</div>
                            </div>

                            {/* Fake report content */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-text-secondary">Overall Score</span>
                                    <div className="flex items-center gap-2">
                                        <div className="h-1.5 w-32 rounded-full bg-white/10 overflow-hidden">
                                            <div className="h-full w-[62%] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full" />
                                        </div>
                                        <span className="text-sm font-bold text-white">62/100</span>
                                    </div>
                                </div>
                                {[
                                    { label: "Website", score: 71, color: "from-blue-500 to-blue-400" },
                                    { label: "Google Profile", score: 48, color: "from-orange-500 to-yellow-400" },
                                    { label: "SEO", score: 55, color: "from-purple-500 to-pink-400" },
                                    { label: "Reviews", score: 82, color: "from-green-500 to-emerald-400" }
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <span className="text-xs text-text-secondary w-28">{item.label}</span>
                                        <div className="flex items-center gap-2 flex-1 max-w-[160px] ml-2">
                                            <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                                                <div
                                                    className={`h-full bg-gradient-to-r ${item.color} rounded-full`}
                                                    style={{ width: `${item.score}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-white font-mono w-8 text-right">{item.score}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-3 border-t border-white/10">
                                <div className="h-px w-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 mb-3" />
                                <div className="text-xs text-text-secondary text-center">
                                    Confidential report prepared for: <span className="text-white">Riverside Dental</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </SectionWrapper>
    );
}