"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const auditCategories = [
    {
        icon: "🌐",
        title: "Website Performance",
        items: ["Page speed & Core Web Vitals", "Mobile UX & responsiveness", "Accessibility compliance", "Security headers & HTTPS", "Broken links & errors"]
    },
    {
        icon: "📍",
        title: "Google Business Profile",
        items: ["Profile completeness score", "Photo quality & quantity", "Q&A management", "Post activity & frequency", "Category accuracy"]
    },
    {
        icon: "📊",
        title: "SEO & Content",
        items: ["Meta tags & schema markup", "Keyword gap analysis", "Content quality scoring", "Backlink profile", "Crawlability & indexation"]
    },
    {
        icon: "⭐",
        title: "Reviews & Reputation",
        items: ["Sentiment analysis", "Response rate tracking", "Review velocity", "Competitor comparison", "Platform coverage"]
    },
    {
        icon: "📱",
        title: "Social & Presence",
        items: ["Platform coverage", "Engagement rate", "Post frequency", "Brand consistency", "Audience growth"]
    },
    {
        icon: "🏆",
        title: "Competitive Intelligence",
        items: ["Top 3 competitor analysis", "Gap identification", "Threat scoring", "Market positioning", "Opportunity mapping"]
    }
];

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45 } }
};

export function WhatWeAudit() {
    return (
        <SectionWrapper id="audit-dimensions">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center mb-12"
            >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight mb-4">
                    30 dimensions. Every blind spot.{" "}
                    <span className="gradient-text">Nothing missed.</span>
                </h2>
            </motion.div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto px-4 mb-12"
            >
                {auditCategories.map((cat, idx) => (
                    <motion.div
                        key={idx}
                        variants={itemVariants}
                        className="glass rounded-2xl p-6 card-hover border border-white/10 flex flex-col"
                    >
                        <div className="flex items-center gap-3 mb-5">
                            <span className="text-3xl">{cat.icon}</span>
                            <h3 className="font-semibold text-white text-lg">{cat.title}</h3>
                        </div>
                        <ul className="space-y-2 mt-auto">
                            {cat.items.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                                    <span className="text-blue-400 mt-0.5 flex-shrink-0">›</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                ))}
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/5" asChild>
                    <Link href="/pricing">See all 30 dimensions &rarr;</Link>
                </Button>
                <Button
                    className="gradient-btn font-semibold px-8"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                    Scan your business now &rarr;
                </Button>
            </motion.div>
        </SectionWrapper>
    );
}