'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Loader2, ArrowRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnimatedCounter } from '@/components/shared/animated-counter';

interface EmailGateProps {
    token: string;
    overallScore: number;
    businessUrl: string;
    categoryScores: Record<string, number>;
}

export function EmailGate({ token, overallScore, businessUrl, categoryScores }: EmailGateProps) {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setLoading(true);
        try {
            const res = await fetch('/api/lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    businessUrl,
                    scanToken: token,
                    scores: categoryScores,
                }),
            });

            if (res.ok) {
                // Redirect to full report
                router.push(`/report/${token}`);
            }
        } catch (err) {
            console.error('Lead capture failed:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
            {/* Blurred background overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-none" />

            {/* Modal */}
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
                            Grade: {grade}
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-2">Audit Complete.</h2>
                    <p className="text-text-secondary text-sm">
                        We found 25 critical areas of improvement for <strong>{businessUrl}</strong>. Enter your email to unlock the full report.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Input
                            type="email"
                            required
                            placeholder="Enter your email address..."
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-bg-input border-white/10 text-white h-12 text-center"
                        />
                    </div>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 gradient-btn font-bold text-base"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                Unlock Report <ArrowRight className="ml-2 w-5 h-5" />
                            </>
                        )}
                    </Button>
                </form>

                <p className="text-[10px] text-text-secondary text-center mt-6 uppercase tracking-wider font-bold opacity-50">
                    🔒 Secure and confidential. We never spam.
                </p>
            </motion.div>
        </motion.div>
    );
}