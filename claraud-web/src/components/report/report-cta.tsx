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
    captureEvent('proposal_clicked');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      viewport={{ once: true }}
      className="w-full"
    >
      <div className="relative group overflow-hidden bg-white/5 border border-white/10 rounded-[2.5rem] p-12 lg:p-20 text-center">
        {/* Glow decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none group-hover:bg-blue-600/20 transition-colors duration-1000" />

        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="text-4xl lg:text-5xl font-black text-white mb-6 tracking-tight">
            Review the proposed next steps
          </h2>
          <p className="text-lg lg:text-xl text-text-secondary mb-10 leading-relaxed font-medium">
            Review the proposal details and the evidence behind each recommendation. Scope, price,
            timing, and any outcome estimate must be confirmed for the specific business before
            work is agreed.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              className="gradient-btn text-lg h-16 px-12 rounded-2xl font-black shadow-2xl shadow-blue-500/30 w-full sm:w-auto transform hover:scale-105 active:scale-95 transition-all"
              onClick={onClick}
              asChild
            >
              <a href={`/proposal/${token}`}>View Proposal →</a>
            </Button>

          </div>
        </div>
      </div>
    </motion.div>
  );
}
