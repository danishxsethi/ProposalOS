'use client';

import { Check, X, Minus } from 'lucide-react';
import { Competitor } from '@/lib/types';
import { motion } from 'framer-motion';

interface CompetitorTableProps {
    businessName: string;
    businessUrl: string;
    userMetrics: {
        overallScore: number;
        reviewCount: number;
        pageSpeed: number;
        gbpCompleteness: number;
    };
    competitors: Competitor[];
}

export function CompetitorTable({ businessName, businessUrl, userMetrics, competitors }: CompetitorTableProps) {
    const metrics = [
        { label: 'Overall Score', key: 'overallScore', format: (v: number) => `${v}/100` },
        { label: 'Google Reviews', key: 'reviewCount', format: (v: number) => v.toString() },
        { label: 'Page Speed Index', key: 'pageSpeed', format: (v: number) => `${v}/100` },
        { label: 'GBP Completeness', key: 'gbpCompleteness', format: (v: number) => `${v}%` },
    ];

    const getComparisonColor = (userVal: number, compVal: number, lowerIsBetter = false) => {
        if (userVal === compVal) return 'text-yellow-500';
        const isWinning = lowerIsBetter ? userVal < compVal : userVal > compVal;
        return isWinning ? 'text-green-500' : 'text-red-500';
    };

    return (
        <div className="w-full">
            <h2 className="text-2xl font-bold text-white mb-8">How You Compare</h2>

            <div className="overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
                <div className="min-w-[800px] bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="py-5 px-6 text-xs font-bold uppercase tracking-widest text-text-secondary">Metric</th>
                                <th className="py-5 px-6 text-xs font-bold uppercase tracking-widest text-blue-400 border-x border-white/10 bg-blue-500/5">
                                    {businessName}
                                </th>
                                {competitors.map((comp) => (
                                    <th key={comp.name} className="py-5 px-6 text-xs font-bold uppercase tracking-widest text-text-secondary">
                                        {comp.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-sm">
                            {metrics.map((metric) => (
                                <tr key={metric.label} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="py-5 px-6 text-text-primary font-sans font-medium">{metric.label}</td>
                                    <td className="py-5 px-6 font-bold text-white border-x border-white/10 bg-blue-500/5">
                                        {metric.format(userMetrics[metric.key as keyof typeof userMetrics])}
                                    </td>
                                    {competitors.map((comp) => {
                                        const compVal = comp[metric.key as keyof Competitor] as number;
                                        const userVal = userMetrics[metric.key as keyof typeof userMetrics];
                                        return (
                                            <td key={comp.name} className={`py-5 px-6 font-medium ${getComparisonColor(userVal, compVal)}`}>
                                                {metric.format(compVal)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}

                            {/* Summary Row */}
                            <tr className="bg-white/5">
                                <td className="py-5 px-6 text-text-secondary font-sans text-xs italic">Market Standing</td>
                                <td className="py-5 px-6 border-x border-white/10 bg-blue-500/10">
                                    <span className="text-xs font-bold text-blue-400 uppercase tracking-tighter">LAGGING</span>
                                </td>
                                {competitors.map((comp) => (
                                    <td key={comp.name} className="py-5 px-6">
                                        <span className={`text-xs font-bold uppercase tracking-tighter ${comp.overallScore > userMetrics.overallScore ? 'text-green-500' : 'text-text-secondary'}`}>
                                            {comp.overallScore > userMetrics.overallScore ? 'LEADING' : 'AVERAGE'}
                                        </span>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="mt-4 text-xs text-text-secondary flex items-center justify-center gap-4">
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500/40" /> Winning</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500/40" /> Opp. identified</span>
                <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-yellow-500/40" /> Competitive parity</span>
            </p>
        </div>
    );
}