"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Smartphone, MapPin, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const problems = [
    {
        icon: <Smartphone className="w-10 h-10 text-blue-400" />,
        title: "Your website is slow or broken on mobile",
        stat: "53% of visitors leave if a page takes >3s to load"
    },
    {
        icon: <MapPin className="w-10 h-10 text-green-400" />,
        title: "Your Google Business Profile is incomplete",
        stat: "Businesses with complete GBP get 7x more clicks"
    },
    {
        icon: <BarChart3 className="w-10 h-10 text-purple-400" />,
        title: "Your competitors are outranking you",
        stat: "The #1 Google result gets 27.6% of all clicks"
    }
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.2 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

export function ProblemSection() {
    return (
        <SectionWrapper id="problem-section" className="text-center">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="mb-16"
            >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                    <span className="block text-white">Most businesses are invisible online.</span>
                    <span className="block gradient-text mt-2">And they don't know why.</span>
                </h2>
            </motion.div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-100px" }}
                className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16 px-4"
            >
                {problems.map((problem, idx) => (
                    <motion.div
                        key={idx}
                        variants={itemVariants}
                        className="glass rounded-2xl p-8 card-hover flex flex-col items-center text-center border border-white/10"
                    >
                        <div className="mb-6 p-4 bg-white/5 rounded-full inline-flex">
                            {problem.icon}
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-4 leading-snug">
                            {problem.title}
                        </h3>
                        <p className="text-sm text-text-secondary mt-auto">
                            {problem.stat}
                        </p>
                    </motion.div>
                ))}
            </motion.div>

            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.6, duration: 0.5 }}
            >
                <Button variant="link" className="text-blue-400 hover:text-blue-300 font-medium text-lg" asChild>
                    <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        Find out what you're missing &rarr;
                    </button>
                </Button>
            </motion.div>
        </SectionWrapper>
    );
}