'use client';

import { useRouter } from 'next/navigation';

import { motion } from 'framer-motion';
import { ArrowRight, Lock } from 'lucide-react';

import { AnimatedCounter } from '@/components/shared/animated-counter';
import { Button } from '@/components/ui/button';

interface EmailGateProps {
  token: string;
  overallScore: number;
  businessUrl: string;
  categoryScores: Record<string, number>;
}

export function EmailGate({ token, overallScore, businessUrl }: EmailGateProps) {
  const router = useRouter();

  const getLetterGrade = (score: number) => {
    if (score >= 90) return { grade: 'A+', color: 'text-green-400' };
    if (score >= 80) return { grade: 'A', color: 'text-green-500' };
    if (score >= 70) return { grade: 'B', color: 'text-blue-400' };
    if (score >= 60) return { grade: 'C', color: 'text-amber-400' };
    if (score >= 50) return { grade: 'D', color: 'text-orange-400' };
    return { grade: 'F', color: 'text-red-500' };
  };

  const { grade, color } = getLetterGrade(overallScore * 10);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-none" />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative glass border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-6">
            <Lock className="w-8 h-8 text-blue-400" />
          </div>

          <div className="flex flex-col items-center gap-1 mb-4">
            <div className={`text-6xl font-black ${color}`}>
              <AnimatedCounter value={Math.round(overallScore * 10)} duration={2} />
            </div>
            <div className={`text-sm font-bold uppercase tracking-widest ${color}`}>
              Preliminary grade: {grade}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Report view</h2>
          <p className="text-text-secondary text-sm">
            Email delivery is paused. This page will not collect an email address. You can open the
            current report for <strong>{businessUrl}</strong> without sharing contact details.
          </p>
          <p className="text-text-secondary text-xs mt-3">
            Treat this score and its findings as preliminary until a reviewer verifies the evidence.
          </p>
        </div>

        <Button
          type="button"
          className="w-full h-12 gradient-btn font-bold text-base"
          onClick={() => router.push(`/report/${token}`)}
        >
          View report <ArrowRight className="ml-2 w-5 h-5" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
