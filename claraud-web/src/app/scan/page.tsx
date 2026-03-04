'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, Plus, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanInput } from '@/components/scan/scan-input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const INDUSTRIES = [
    'Dentists', 'Law Firms', 'HVAC', 'Restaurants', 'Real Estate',
    'Gyms', 'Veterinary', 'Salons', 'Contractors', 'Retail',
];

export default function ScanPage() {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [industry, setIndustry] = useState('');
    const [competitors, setCompetitors] = useState<string[]>(['']);
    const [includeEmail, setIncludeEmail] = useState(false);
    const [includeSocial, setIncludeSocial] = useState(false);

    const addCompetitor = () => {
        if (competitors.length < 3) setCompetitors([...competitors, '']);
    };
    const removeCompetitor = (idx: number) => {
        setCompetitors(competitors.filter((_, i) => i !== idx));
    };
    const updateCompetitor = (idx: number, val: string) => {
        const next = [...competitors];
        next[idx] = val;
        setCompetitors(next);
    };

    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-16">
            {/* Back link */}
            <div className="w-full max-w-xl mb-8">
                <Link href="/" className="text-sm text-text-secondary hover:text-white transition-colors">
                    ← Back to home
                </Link>
            </div>

            {/* Heading */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="w-full max-w-xl text-center mb-8"
            >
                <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
                    Scan your business
                </h1>
                <p className="text-text-secondary">
                    Enter your website URL or business name. Results in 30 seconds.
                </p>
            </motion.div>

            {/* Main scan input */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="w-full max-w-xl mb-4"
            >
                <ScanInput variant="large" extraData={{ industry, competitors: competitors.filter(Boolean), includeEmail, includeSocial }} />
            </motion.div>

            {/* Advanced options */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="w-full max-w-xl"
            >
                <button
                    onClick={() => setAdvancedOpen(!advancedOpen)}
                    className="flex items-center gap-2 text-sm text-text-secondary hover:text-white transition-colors w-full justify-center mb-3"
                >
                    <motion.span animate={{ rotate: advancedOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4" />
                    </motion.span>
                    Advanced options
                </button>

                <AnimatePresence>
                    {advancedOpen && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                        >
                            <div className="glass border border-white/10 rounded-2xl p-6 space-y-5">
                                {/* Industry dropdown */}
                                <div>
                                    <Label className="text-sm text-text-secondary mb-2 block">Industry</Label>
                                    <Select value={industry} onValueChange={setIndustry}>
                                        <SelectTrigger className="bg-bg-input border-white/10 text-white">
                                            <SelectValue placeholder="Select your industry..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-bg-card border-white/10">
                                            {INDUSTRIES.map((ind) => (
                                                <SelectItem key={ind} value={ind.toLowerCase()} className="text-white hover:bg-white/5">
                                                    {ind}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Competitor URLs */}
                                <div>
                                    <Label className="text-sm text-text-secondary mb-2 block">Competitor URLs</Label>
                                    <div className="space-y-2">
                                        {competitors.map((val, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <Input
                                                    value={val}
                                                    onChange={(e) => updateCompetitor(idx, e.target.value)}
                                                    placeholder={`Competitor ${idx + 1} URL`}
                                                    className="bg-bg-input border-white/10 text-white placeholder:text-text-secondary"
                                                />
                                                {competitors.length > 1 && (
                                                    <button
                                                        onClick={() => removeCompetitor(idx)}
                                                        className="text-text-secondary hover:text-red-400 transition-colors p-2"
                                                        aria-label="Remove competitor"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        {competitors.length < 3 && (
                                            <button
                                                onClick={addCompetitor}
                                                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                                            >
                                                <Plus className="w-3 h-3" /> Add competitor
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Checkboxes */}
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <Checkbox
                                            checked={includeEmail}
                                            onCheckedChange={(v: any) => setIncludeEmail(!!v)}
                                            className="border-white/20"
                                        />
                                        <span className="text-sm text-text-secondary group-hover:text-white transition-colors">
                                            Include email domain health check
                                        </span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <Checkbox
                                            checked={includeSocial}
                                            onCheckedChange={(v) => setIncludeSocial(!!v)}
                                            className="border-white/20"
                                        />
                                        <span className="text-sm text-text-secondary group-hover:text-white transition-colors">
                                            Include social media deep dive
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* How it works mini-explainer */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="flex items-center gap-4 mt-10 text-sm text-text-secondary"
            >
                {[
                    { icon: '🔍', label: 'Scan' },
                    { icon: '🧠', label: 'Diagnose' },
                    { icon: '🔧', label: 'Fix' },
                ].map((step, i) => (
                    <>
                        <div key={step.label} className="flex items-center gap-2">
                            <span>{step.icon}</span>
                            <span>{step.label}</span>
                        </div>
                        {i < 2 && <span key={`arrow-${i}`} className="text-white/20">→</span>}
                    </>
                ))}
            </motion.div>
        </div>
    );
}