'use client';

import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';

interface RadarData {
    category: string;
    score: number;
    fullMark: number;
}

interface RadarChartProps {
    data: RadarData[];
}

export function AuditRadarChart({ data }: RadarChartProps) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            viewport={{ once: true }}
            className="w-full h-[400px] flex items-center justify-center relative bg-white/5 rounded-3xl border border-white/10 overflow-hidden"
        >
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 pointer-events-none" />

            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid stroke="#ffffff" strokeOpacity={0.1} />
                    <PolarAngleAxis
                        dataKey="category"
                        tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 500 }}
                    />
                    <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#radarGradient)"
                        fillOpacity={0.6}
                        animationDuration={1500}
                        animationBegin={300}
                    />
                    <defs>
                        <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.8} />
                        </linearGradient>
                    </defs>
                </RadarChart>
            </ResponsiveContainer>
        </motion.div>
    );
}