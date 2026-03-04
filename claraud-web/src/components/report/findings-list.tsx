'use client';

import { Button } from '@/components/ui/button';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Zap, ShieldAlert, Info } from 'lucide-react';
import { Finding } from '@/lib/types';
import { motion } from 'framer-motion';
import { usePostHog } from '@/hooks/use-posthog';

interface FindingsListProps {
    findings: Finding[];
    limit?: number;
    title?: string;
}

export function FindingsList({ findings, limit = 5, title = "Top Priority Findings" }: FindingsListProps) {
    const { captureEvent } = usePostHog();
    const displayFindings = findings.slice(0, limit);

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
            case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
            default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
        }
    };

    const getComplexityIcon = (complexity: string) => {
        switch (complexity) {
            case 'quick-win': return <Zap className="w-3 h-3 mr-1" />;
            case 'moderate': return <ShieldAlert className="w-3 h-3 mr-1" />;
            case 'complex': return <AlertCircle className="w-3 h-3 mr-1" />;
            default: return null;
        }
    };

    const onExpand = (id: string) => {
        captureEvent('finding_expanded', { findingId: id });
    };

    return (
        <div className="w-full">
            {title && (
                <h2 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
                    {title}
                    <Badge variant="outline" className="border-white/10 text-text-secondary bg-white/5 font-mono">
                        {findings.length} total
                    </Badge>
                </h2>
            )}

            <Accordion type="single" collapsible className="space-y-4">
                {displayFindings.map((finding, idx) => (
                    <motion.div
                        key={finding.id}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        viewport={{ once: true }}
                    >
                        <AccordionItem
                            value={finding.id}
                            className="border border-white/10 rounded-2xl bg-white/5 overflow-hidden hover:bg-white/[0.07] transition-colors"
                        >
                            <AccordionTrigger
                                className="px-6 py-4 hover:no-underline group"
                                onClick={() => onExpand(finding.id)}
                            >
                                <div className="flex items-center justify-between w-full text-left gap-4 pr-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <Badge variant="outline" className={`capitalize px-3 py-0.5 font-bold ${getSeverityColor(finding.severity)}`}>
                                            {finding.severity}
                                        </Badge>
                                        <span className="font-semibold text-white tracking-tight leading-tight">
                                            {finding.title}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="bg-bg-input text-text-secondary border-none text-[10px] px-2 py-0.5 flex items-center">
                                            {getComplexityIcon(finding.fixComplexity)}
                                            <span className="uppercase tracking-wider">{finding.fixComplexity.replace('-', ' ')}</span>
                                        </Badge>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-6 pb-6 pt-2 text-left">
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mb-2">Impact</h4>
                                        <p className="text-sm text-text-primary italic leading-relaxed">
                                            "{finding.impact}"
                                        </p>
                                    </div>

                                    {finding.evidence && (
                                        <div>
                                            <h4 className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mb-2">Evidence</h4>
                                            <div className="bg-[#0d1117] p-4 rounded-xl font-mono text-xs text-blue-400 border border-white/5">
                                                {finding.evidence}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <h4 className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mb-2 flex items-center gap-1.5">
                                            <Info className="w-3 h-3" />
                                            Why this matters
                                        </h4>
                                        <p className="text-sm text-text-secondary leading-relaxed">
                                            {finding.severity === 'critical'
                                                ? "This is a major bottleneck preventing conversions and hurting your brand authority. Immediate action is required."
                                                : finding.severity === 'high'
                                                    ? "This issue is negatively impacting your search visibility and user trust."
                                                    : "Resolving this will provide a steady boost to your overall online performance and credibility."
                                            }
                                        </p>
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </motion.div>
                ))}
            </Accordion>

            {findings.length > limit && (
                <div className="mt-8 text-center">
                    <Button variant="outline" className="border-white/10 hover:bg-white/5 text-text-secondary px-8 rounded-full" asChild>
                        <button onClick={() => {
                            const el = document.getElementById('all-findings');
                            el?.scrollIntoView({ behavior: 'smooth' });
                        }}>
                            See all {findings.length} findings
                        </button>
                    </Button>
                </div>
            )}
        </div>
    );
}