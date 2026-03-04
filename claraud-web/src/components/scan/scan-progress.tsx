'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2, AlertTriangle, Circle } from 'lucide-react';
import { AUDIT_CATEGORIES } from '@/lib/constants';
import { ScanStatus } from '@/lib/types';
import { Card } from '@/components/ui/card';

interface ScanProgressProps {
    modules: ScanStatus['modules'];
}

export function ScanProgress({ modules }: ScanProgressProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
            {AUDIT_CATEGORIES.map((category) => {
                const module = modules.find((m) => m.id === category.id);
                const status = module?.status || 'pending';
                const score = module?.score;
                const findings = module?.findingsCount;

                return (
                    <motion.div
                        key={category.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                    >
                        <Card
                            className={`relative overflow-hidden p-6 h-full flex flex-col items-center text-center transition-all duration-500 border-2 ${status === 'scanning'
                                    ? 'border-blue-500/50 bg-blue-500/5 shadow-[0_0_20px_rgba(59,130,246,0.15)] pulse-subtle'
                                    : status === 'complete'
                                        ? 'border-green-500/30 bg-green-500/5'
                                        : status === 'error'
                                            ? 'border-amber-500/30 bg-amber-500/5'
                                            : 'border-white/5 bg-[#1f2937]'
                                }`}
                        >
                            {/* Icon Container */}
                            <div
                                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors duration-500 ${status === 'scanning'
                                        ? 'bg-blue-500 text-white'
                                        : status === 'complete'
                                            ? 'bg-green-500/20 text-green-400'
                                            : status === 'error'
                                                ? 'bg-amber-500/20 text-amber-400'
                                                : 'bg-white/5 text-white/20'
                                    }`}
                            >
                                <category.icon className="w-6 h-6" />
                            </div>

                            {/* Text info */}
                            <h3 className={`font-semibold text-sm mb-1 ${status === 'pending' ? 'text-white/40' : 'text-white'}`}>
                                {category.name}
                            </h3>

                            <div className="mt-auto pt-2 h-6 flex items-center justify-center">
                                <AnimatePresence mode="wait">
                                    {status === 'pending' && (
                                        <motion.span
                                            key="pending"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="text-[10px] uppercase tracking-wider text-white/20 font-bold"
                                        >
                                            Waiting...
                                        </motion.span>
                                    )}

                                    {status === 'scanning' && (
                                        <motion.div
                                            key="scanning"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-center gap-1.5 text-blue-400 text-[10px] uppercase tracking-wider font-bold"
                                        >
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            Scanning...
                                        </motion.div>
                                    )}

                                    {status === 'complete' && (
                                        <motion.div
                                            key="complete"
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="flex flex-col items-center"
                                        >
                                            <span className="text-lg font-black text-white leading-none">
                                                {score?.toFixed(1)}/10
                                            </span>
                                            <span className="text-[9px] text-green-400 font-bold uppercase mt-1">
                                                {findings} Findings
                                            </span>
                                        </motion.div>
                                    )}

                                    {status === 'error' && (
                                        <motion.div
                                            key="error"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-center gap-1 text-amber-400 text-[10px] font-bold uppercase"
                                        >
                                            <AlertTriangle className="w-3 h-3" />
                                            Limited Data
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Success corner checkmark */}
                            {status === 'complete' && (
                                <div className="absolute top-2 right-2">
                                    <Check className="w-4 h-4 text-green-500" />
                                </div>
                            )}
                        </Card>
                    </motion.div>
                );
            })}
        </div>
    );
}

const css = `
@keyframes pulse-subtle {
  0% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.01); }
  100% { opacity: 0.8; transform: scale(1); }
}
.pulse-subtle {
  animation: pulse-subtle 2s infinite ease-in-out;
}
`;