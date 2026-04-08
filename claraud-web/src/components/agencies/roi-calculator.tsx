"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { usePostHog } from '@/hooks/use-posthog';

function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number, prefix?: string, suffix?: string }) {
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
        const duration = 1000;
        const steps = 60;
        const stepTime = duration / steps;
        const diff = value - displayValue;
        const increment = diff / steps;

        let currentStep = 0;
        const timer = setInterval(() => {
            currentStep++;
            if (currentStep >= steps) {
                setDisplayValue(value);
                clearInterval(timer);
            } else {
                setDisplayValue(prev => prev + increment);
            }
        }, stepTime);

        return () => clearInterval(timer);
    }, [value]);

    return (
        <span>{prefix}{Math.floor(displayValue).toLocaleString()}{suffix}</span>
    );
}

export function ROICalculator() {
    const { captureEvent } = usePostHog();
    const [proposals, setProposals] = useState(20);
    const [closeRate, setCloseRate] = useState(15);
    const [avgValue, setAvgValue] = useState(3000);

    const withoutClaraud = proposals * (closeRate / 100) * avgValue;
    const projectedCloseRate = Math.min(closeRate * 2.33, 50);
    const withClaraud = proposals * (projectedCloseRate / 100) * avgValue;
    const additionalRevenue = withClaraud - withoutClaraud;

    useEffect(() => {
        captureEvent('roi_calculator_changed', { proposals, closeRate, avgValue });
    }, [proposals, closeRate, avgValue]);

    return (
        <div className="max-w-5xl mx-auto px-4 py-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label className="text-white font-medium">Proposals you send per month</Label>
                            <span className="text-blue-400 font-bold">{proposals}</span>
                        </div>
                        <Slider
                            value={[proposals]}
                            onValueChange={(val) => setProposals(val[0])}
                            max={100}
                            min={5}
                            step={1}
                            className="py-4"
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label className="text-white font-medium">Current close rate</Label>
                            <span className="text-blue-400 font-bold">{closeRate}%</span>
                        </div>
                        <Slider
                            value={[closeRate]}
                            onValueChange={(val) => setCloseRate(val[0])}
                            max={50}
                            min={5}
                            step={1}
                            className="py-4"
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label className="text-white font-medium">Average project value</Label>
                            <span className="text-blue-400 font-bold">${avgValue.toLocaleString()}</span>
                        </div>
                        <Slider
                            value={[avgValue]}
                            onValueChange={(val) => setAvgValue(val[0])}
                            max={10000}
                            min={500}
                            step={500}
                            className="py-4"
                        />
                    </div>
                </div>

                <motion.div
                    key={`${proposals}-${closeRate}-${avgValue}`}
                    initial={{ scale: 0.98, opacity: 0.9 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass p-8 rounded-3xl border border-blue-500/30 relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/10 pointer-events-none" />

                    <div className="space-y-6 relative z-10">
                        <div>
                            <p className="text-text-secondary text-sm uppercase tracking-widest font-bold mb-1">Without Claraud</p>
                            <p className="text-2xl font-bold text-white/70">
                                <AnimatedCounter value={withoutClaraud} prefix="$" />/mo
                            </p>
                        </div>

                        <div>
                            <p className="text-blue-400 text-sm uppercase tracking-widest font-bold mb-1">With Claraud (Projected {projectedCloseRate.toFixed(0)}% Close Rate)</p>
                            <p className="text-3xl font-bold text-white">
                                <AnimatedCounter value={withClaraud} prefix="$" />/mo
                            </p>
                        </div>

                        <div className="pt-6 border-t border-white/10">
                            <p className="text-text-secondary text-sm font-medium mb-1">Additional revenue:</p>
                            <div className="text-3xl md:text-4xl font-bold gradient-text">
                                <AnimatedCounter value={additionalRevenue} prefix="$" />/mo
                            </div>
                            <div className="text-lg font-semibold text-text-secondary mt-1">
                                → <AnimatedCounter value={additionalRevenue * 12} prefix="$" />/year
                            </div>
                        </div>
                    </div>

                    <motion.div
                        animate={{
                            boxShadow: ["0 0 0px rgba(59, 130, 246, 0)", "0 0 20px rgba(59, 130, 246, 0.2)", "0 0 0px rgba(59, 130, 246, 0)"]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 rounded-3xl pointer-events-none"
                    />
                </motion.div>
            </div>
        </div>
    );
}
