'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FreeAuditPage() {
    // Stages: INPUT -> ANALYZING -> RESULTS
    const [stage, setStage] = useState<'INPUT' | 'ANALYZING' | 'RESULTS'>('INPUT');

    // Input State
    const [url, setUrl] = useState('');
    const [businessName, setBusinessName] = useState('');

    // Analysis State
    const [auditId, setAuditId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [completedModules, setCompletedModules] = useState<string[]>([]);

    // Results State
    const [result, setResult] = useState<any>(null);
    const [email, setEmail] = useState('');
    const [unlocked, setUnlocked] = useState(false);

    // Hardcoded list of "Visual" modules for the checklist
    const MODULES = [
        { id: 'websiteCrawler', label: 'Scanning website structure...' },
        { id: 'gbp', label: 'Checking Google Business Profile...' },
        { id: 'mobileUX', label: 'Analyzing Mobile UX...' },
        { id: 'competitor', label: 'Identifying Competitors...' }
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStage('ANALYZING');

        try {
            const res = await fetch('/api/public/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businessName, websiteUrl: url })
            });
            const data = await res.json();
            if (data.id) {
                setAuditId(data.id);
            }
        } catch (error) {
            alert('Failed to start audit.');
            setStage('INPUT');
        }
    };

    // Polling Effect
    useEffect(() => {
        if (stage !== 'ANALYZING' || !auditId) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/public/audit/${auditId}`);
                const data = await res.json();

                if (data.modulesCompleted) {
                    setCompletedModules(data.modulesCompleted);
                    // Approximation of progress
                    const p = Math.min((data.modulesCompleted.length / 8) * 100, 95);
                    setProgress(p);
                }

                if (data.status === 'COMPLETE' || data.status === 'PARTIAL') {
                    setResult(data);
                    setProgress(100);
                    setTimeout(() => setStage('RESULTS'), 1000);
                    clearInterval(interval);
                }
            } catch (e) {
                console.error(e);
            }
        }, 1500);

        return () => clearInterval(interval);
    }, [stage, auditId]);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        // Here we would call the Capture API
        // For MVP, just mock unlock
        setUnlocked(true);
        alert(`Full report sent to ${email}! (Mock)`);
    };

    if (stage === 'INPUT') {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="max-w-xl w-full text-center">
                    <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-6">
                        How does your business score?
                    </h1>
                    <p className="text-xl text-slate-400 mb-8">
                        Get a comprehensive AI audit of your digital presence in 60 seconds.
                    </p>

                    <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
                        <div className="space-y-4">
                            <input
                                type="text"
                                required
                                placeholder="Business Name (e.g. Acme Dental)"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white text-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                value={businessName}
                                onChange={e => setBusinessName(e.target.value)}
                            />
                            <input
                                type="url"
                                required
                                placeholder="Website URL (e.g. acmedental.com)"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white text-lg focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                            />
                            <button
                                type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-lg text-xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-[1.02]"
                            >
                                Get Your Free Score
                            </button>
                        </div>
                        <p className="mt-4 text-xs text-slate-500">No credit card required. Instant results.</p>
                    </form>
                </div>
            </div>
        );
    }

    if (stage === 'ANALYZING') {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <h2 className="text-2xl font-bold text-white mb-8 text-center">Analyzing {businessName}...</h2>

                    {/* Progress Bar */}
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-8">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Checklist */}
                    <div className="space-y-4">
                        {MODULES.map(mod => {
                            const isDone = completedModules.includes(mod.id);
                            // Simple logic: if done, show check. If not done but prev is done, show spinner? 
                            // For MVP, just check if included.
                            return (
                                <div key={mod.id} className="flex items-center gap-4 text-slate-300">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${isDone ? 'bg-green-500 border-green-500 text-black' : 'border-slate-700 bg-slate-900'
                                        }`}>
                                        {isDone ? '✓' : ''}
                                    </div>
                                    <span className={isDone ? 'text-white' : 'opacity-50'}>{mod.label}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // RESULTS
    return (
        <div className="min-h-screen bg-slate-950 p-4">
            <div className="max-w-4xl mx-auto py-12">
                <div className="text-center mb-12">
                    <div className="inline-block px-4 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-bold mb-4">
                        Audit Complete
                    </div>
                    <h1 className="text-4xl font-bold text-white mb-2">{businessName} Report Card</h1>
                </div>

                <div className="grid md:grid-cols-2 gap-8 mb-12">
                    {/* Score Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center">
                        <div className="w-40 h-40 rounded-full border-8 border-indigo-500 flex items-center justify-center text-5xl font-black text-white mb-4 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                            {result?.overallScore || 72}
                        </div>
                        <div className="text-slate-400 uppercase tracking-widest font-bold text-sm">Overall Score</div>
                    </div>

                    {/* Teaser Findings */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                        <h3 className="text-xl font-bold text-white mb-6">Top Issues Found</h3>
                        <div className="space-y-4">
                            {result?.findings?.map((f: any, i: number) => (
                                <div key={i} className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                    <span className="text-red-500 mt-1">⚠️</span>
                                    <div>
                                        <div className="font-bold text-red-200 text-sm">{f.title}</div>
                                        <div className="text-xs text-red-400/70">{f.category}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Gated Section */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                    <div className="p-8 blur-sm select-none opacity-50">
                        <h3 className="text-2xl font-bold text-white mb-4">Detailed Analysis</h3>
                        <div className="h-64 bg-slate-800 rounded animate-pulse"></div>
                    </div>

                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-6 text-center">
                        <span className="text-4xl mb-4">🔒</span>
                        <h2 className="text-3xl font-bold text-white mb-4">Unlock Your Full Report</h2>
                        <p className="text-slate-300 max-w-md mb-8">
                            Get the complete 15-page PDF report with detailed remediation steps and competitor analysis securely delivered to your inbox.
                        </p>

                        {!unlocked ? (
                            <form onSubmit={handleUnlock} className="flex gap-2 max-w-md w-full">
                                <input
                                    type="email"
                                    required
                                    placeholder="Enter your email"
                                    className="flex-1 bg-white text-slate-900 px-4 py-3 rounded-lg font-medium outline-none"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-lg shadow-lg shadow-indigo-500/20"
                                >
                                    Unlock
                                </button>
                            </form>
                        ) : (
                            <div className="bg-green-500 text-white px-6 py-3 rounded-lg font-bold">
                                ✓ Check your inbox!
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
