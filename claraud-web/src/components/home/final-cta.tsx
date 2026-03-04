"use client";

import { motion } from 'framer-motion';
import { ScanInput } from '@/components/scan/scan-input';

export function FinalCta() {
    return (
        <section className="relative bg-bg-secondary border-t border-white/10 py-24">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/3 to-purple-500/3 pointer-events-none" />
            <div className="container relative z-10 flex flex-col items-center text-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="mb-10"
                >
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                        <span className="text-white">Your competitors are already optimizing.</span>
                        <br />
                        <span className="gradient-text">Are you?</span>
                    </h2>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="w-full max-w-xl mx-auto mb-6"
                >
                    <ScanInput variant="large" />
                </motion.div>

                <motion.p
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="text-sm text-text-secondary"
                >
                    Free forever for the first scan. No credit card. No commitment.
                </motion.p>
            </div>
        </section>
    );
}