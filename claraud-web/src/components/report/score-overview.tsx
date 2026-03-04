'use client';

import { motion } from 'framer-motion';
import { AuditRadarChart } from './radar-chart';
import { Progress } from '@/components/ui/progress';
import { Globe, Search, Smartphone, Shield, Share2, Award, Zap } from 'lucide-react';
import { CategoryScore } from '@/lib/types';

interface ScoreOverviewProps {
    categories: CategoryScore[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    website: <Smartphone className="w-5 h-5" />,
    google: <Shield className="w-5 h-5" />,
    seo: <Search className="w-5 h-5" />,
    reviews: <Award className="w-5 h-5" />,
    social: <Share2 className="w-5 h-5" />,
    competitors: <Zap className="w-5 h-5" />,
};

export function ScoreOverview({ categories }: ScoreOverviewProps) {
    const radarData = categories.map(cat => ({
        category: cat.name,
        score: cat.score,
        fullMark: 100
    }));

    const getScoreColor = (score: number) => {
        if (score >= 70) return 'bg-green-500';
        if (score >= 40) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    const getScoreTextColor = (score: number) => {
        if (score >= 70) return 'text-green-500';
        if (score >= 40) return 'text-yellow-500';
        return 'text-red-500';
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Radar Chart */}
            <div className="w-full">
                <h3 className="text-sm font-bold uppercase tracking-widest text-text-secondary mb-6 ml-1">
                    Performance Profile
                </h3>
                <AuditRadarChart data={radarData} />
            </div>

            {/* Right: Score Bars */}
            <div className="space-y-8">
                <h3 className="text-sm font-bold uppercase tracking-widest text-text-secondary mb-6">
                    Category Deep Dive
                </h3>
                {categories.map((cat, idx) => (
                    <motion.div
                        key={cat.id}
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: idx * 0.1 }}
                        viewport={{ once: true }}
                        className="group"
                    >
                        <div className="flex justify-between items-center mb-2">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg bg-white/5 border border-white/10 group-hover:border-blue-500/30 transition-colors ${getScoreTextColor(cat.score)}`}>
                                    {CATEGORY_ICONS[cat.id] || <Globe className="w-4 h-4" />}
                                </div>
                                <span className="font-semibold text-white tracking-tight">{cat.name}</span>
                            </div>
                            <span className={`font-bold ${getScoreTextColor(cat.score)}`}>{cat.score}/100</span>
                        </div>

                        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-3">
                            <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${cat.score}%` }}
                                transition={{ duration: 1, delay: 0.5 + (idx * 0.1), ease: "easeOut" }}
                                viewport={{ once: true }}
                                className={`h-full rounded-full ${getScoreColor(cat.score)}`}
                            />
                        </div>

                        <p className="text-xs text-text-secondary leading-relaxed group-hover:text-text-primary transition-colors">
                            {cat.summary}
                        </p>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}