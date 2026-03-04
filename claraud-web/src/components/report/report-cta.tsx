'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { usePostHog } from '@/hooks/use-posthog';

interface ReportCTAProps {
    token: string;
}

export function ReportCTA({ token }: ReportCTAProps) {
    const { captureEvent } = usePostHog();

    const onClick = () => {
        captureEvent('proposal_clicked', { token });
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
            className="w-full"
        >
            <div className="relative group overflow-hidden bg-white/5 border border-white/10 rounded-[2.5rem] p-12 lg:p-20 text-center">
                {/* Glow decoration */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none group-hover:bg-blue-600/20 transition-colors duration-1000" />

                <div className="relative z-10 max-w-2xl mx-auto">
                    <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tight">
                        Ready to fix these issues?
                    </h2>
                    <p className="text-lg lg:text-xl text-text-secondary mb-10 leading-relaxed font-medium">
                        We've built a <span className="text-blue-400">personalized action plan</span> with exact pricing, timelines, and projected ROI to leapfrog your competitors.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Button
                            className="gradient-btn text-lg h-16 px-12 rounded-2xl font-black shadow-2xl shadow-blue-500/30 w-full sm:w-auto transform hover:scale-105 active:scale-95 transition-all"
                            onClick={onClick}
                            asChild
                        >
                            <a href={`/proposal/${token}`}>
                                View Your Action Plan →
                            </a>
                        </Button>

                        <Button
                            variant="ghost"
                            className="text-text-secondary hover:text-white h-16 px-10 font-bold w-full sm:w-auto"
                            onClick={() => {
                                const header = document.querySelector('header') || document.body;
                                header.scrollIntoView({ behavior: 'smooth' });
                            }}
                        >
                            Or share this report
                        </Button>
                    </div>

                    <div className="mt-12 flex items-center justify-center gap-8 grayscale opacity-40 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-700">
                        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-secondary">Compatible with</div>
                        <div className="h-6 w-px bg-white/10" />
                        <img src="/placeholder.svg" alt="Google" className="h-5 invert" />
                        <img src="/placeholder.svg" alt="Instagram" className="h-5 invert" />
                        <img src="/placeholder.svg" alt="Stripe" className="h-5 invert" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}