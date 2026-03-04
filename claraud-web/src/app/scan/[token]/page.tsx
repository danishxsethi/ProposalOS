'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { useScanProgress } from '@/hooks/use-scan-progress';
import { ScanProgress } from '@/components/scan/scan-progress';
import { EmailGate } from '@/components/scan/email-gate';
import { MOCK_LOG_ENTRIES } from '@/lib/mock-data';
import { Progress } from '@/components/ui/progress';

export default function ScanProgressPage() {
    const { token } = useParams() as { token: string };
    const { status, isComplete, error } = useScanProgress(token);
    const [showGate, setShowGate] = useState(false);
    const [countdown, setCountdown] = useState(30);
    const [logs, setLogs] = useState<{ icon: string; text: string; id: string }[]>([]);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Derived scores for the email gate
    const categoryScores = useMemo(() => {
        if (!status?.modules) return {};
        return status.modules.reduce((acc, mod) => {
            if (mod.score !== undefined) acc[mod.id] = mod.score;
            return acc;
        }, {} as Record<string, number>);
    }, [status?.modules]);

    // Countdown timer
    useEffect(() => {
        if (isComplete) return;
        const timer = setInterval(() => {
            setCountdown((prev) => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [isComplete]);

    // Handle gate delay
    useEffect(() => {
        if (isComplete && status?.status === 'complete') {
            const timer = setTimeout(() => setShowGate(true), 1500);
            return () => clearTimeout(timer);
        }
    }, [isComplete, status?.status]);

    // Generate logs from completed modules
    useEffect(() => {
        if (!status?.modules) return;

        const newLogs: typeof logs = [];
        status.modules.forEach(mod => {
            if (mod.status === 'complete' || mod.status === 'error') {
                const entries = MOCK_LOG_ENTRIES[mod.id] || [];
                entries.forEach((text, idx) => {
                    const id = `${mod.id}-${idx}`;
                    if (!logs.find(l => l.id === id)) {
                        const icon = text.startsWith('✓') ? 'success' : text.startsWith('⚠') ? 'warning' : 'info';
                        newLogs.push({ icon, text: text.substring(2), id });
                    }
                });
            }
        });

        if (newLogs.length > 0) {
            setLogs(prev => [...prev, ...newLogs]);
        }
    }, [status?.modules, logs]);

    // Auto-scroll logs
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    if (error) {
        return (
            <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
                <div className="glass border border-red-500/20 rounded-2xl p-8 max-w-md text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Scan Failed</h2>
                    <p className="text-text-secondary mb-6">{error}</p>
                    <button onClick={() => window.location.reload()} className="gradient-btn px-6 py-2 rounded-full font-bold">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-20 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-3xl z-10 flex flex-col items-center text-center">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-10 w-full"
                >
                    <h1 className="text-3xl font-extrabold text-white mb-2">
                        {isComplete ? 'Scan complete!' : 'Scanning your business...'}
                    </h1>
                    <p className="text-blue-400 font-mono text-sm tracking-wide">
                        {status?.status === 'complete' ? 'Processing results...' : `~${countdown}s remaining`}
                    </p>
                </motion.div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-12">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${status?.progress || 0}%` }}
                        transition={{ duration: 0.5 }}
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                    />
                </div>

                {/* Module Grid */}
                <ScanProgress modules={status?.modules || []} />

                {/* Real-time log panel */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="w-full mt-10 bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-2xl"
                >
                    <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-3 h-3 text-text-secondary" />
                            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest font-mono">
                                Audit Engine Output
                            </span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-red-500/50" />
                            <div className="w-2 h-2 rounded-full bg-yellow-500/50" />
                            <div className="w-2 h-2 rounded-full bg-green-500/50" />
                        </div>
                    </div>

                    <div className="p-4 h-48 overflow-y-auto font-mono text-xs text-left scrollbar-hide space-y-1">
                        <AnimatePresence initial={false}>
                            {logs.map((log) => (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-start gap-2 py-0.5"
                                >
                                    <span className="flex-shrink-0 mt-0.5">
                                        {log.icon === 'success' ? (
                                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                                        ) : log.icon === 'warning' ? (
                                            <AlertCircle className="w-3 h-3 text-yellow-500" />
                                        ) : (
                                            <Info className="w-3 h-3 text-blue-500" />
                                        )}
                                    </span>
                                    <span className={log.icon === 'warning' ? 'text-yellow-200/80' : 'text-text-secondary'}>
                                        {log.text}
                                    </span>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        <div ref={logEndRef} />
                    </div>
                </motion.div>
            </div>

            {/* Email Gate Overlay */}
            <AnimatePresence>
                {showGate && status?.overallScore && (
                    <EmailGate
                        token={token}
                        overallScore={status.overallScore}
                        businessUrl="your business"
                        categoryScores={categoryScores}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
