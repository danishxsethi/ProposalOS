
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ComparisonPage() {
    const params = useParams();
    const { id, previousId } = params;

    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id || !previousId) return;

        const fetchData = async () => {
            try {
                const res = await fetch(`/api/audit/${id}/compare/${previousId}`);
                if (res.ok) {
                    const json = await res.json();
                    setData(json.comparison);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [id, previousId]);

    if (isLoading) return <div className="p-8 text-slate-400">Loading comparison...</div>;
    if (!data) return <div className="p-8 text-slate-400">Failed to load comparison data.</div>;

    const { improved, worsened, unchanged, newFindings, scoreDiff } = data;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <header className="mb-10">
                <div className="flex items-center gap-4 text-sm text-slate-500 mb-2">
                    <span>{new Date(data.prevDate).toLocaleDateString()}</span>
                    <span>→</span>
                    <span>{new Date(data.currDate).toLocaleDateString()}</span>
                </div>
                <h1 className="text-3xl font-bold text-white mb-2">Progress Report</h1>

                <div className="flex items-center gap-4 mt-6">
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="text-slate-400 text-xs uppercase font-bold text-center">Score Change</div>
                        <div className={`text-3xl font-bold text-center ${scoreDiff > 0 ? 'text-green-400' : scoreDiff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                        </div>
                    </div>

                    <div className="bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                        <div className="text-green-400 text-xs uppercase font-bold text-center">Issues Fixed</div>
                        <div className="text-3xl font-bold text-green-400 text-center">{improved.length}</div>
                    </div>

                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                        <div className="text-slate-400 text-xs uppercase font-bold text-center">New Issues</div>
                        <div className="text-3xl font-bold text-slate-100 text-center">{newFindings.length}</div>
                    </div>
                </div>
            </header>

            <div className="space-y-8">
                {/* IMPROVED */}
                {improved.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold text-green-400 mb-4 flex items-center gap-2">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Resolved Issues
                        </h2>
                        <div className="grid gap-4">
                            {improved.map((f: any) => (
                                <div key={f.id} className="bg-green-900/10 border border-green-500/20 p-4 rounded-lg flex justify-between items-center opacity-75">
                                    <div>
                                        <div className="font-semibold text-green-200 line-through decoration-green-500/50">{f.title}</div>
                                        <div className="text-sm text-green-200/50">{f.module}</div>
                                    </div>
                                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">FIXED</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* NEW FINDINGS */}
                {newFindings.length > 0 && (
                    <section>
                        <h2 className="text-xl font-bold text-slate-100 mb-4 flex items-center gap-2">
                            <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            New Issues Detected
                        </h2>
                        <div className="grid gap-4">
                            {newFindings.map((f: any) => (
                                <div key={f.id} className="bg-slate-800 border border-slate-700 p-4 rounded-lg">
                                    <div className="flex justify-between">
                                        <div className="font-semibold text-white">{f.title}</div>
                                        <div className="text-red-400 font-bold bg-red-400/10 px-2 rounded text-xs h-fit">{f.impactScore}/10</div>
                                    </div>
                                    <p className="text-sm text-slate-400 mt-1">{f.description}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* WORSENED (Logic wasn't explicit in my route, but it's new findings technically unless re-occurring with worse score) */}

                {/* UNCHANGED */}
                <section>
                    <h2 className="text-xl font-bold text-slate-400 mb-4">Unchanged Issues</h2>
                    <div className="grid gap-4 opacity-75">
                        {unchanged.slice(0, 5).map((f: any) => ( // Show only top 5 unchanged to avoid clutter
                            <div key={f.id} className="bg-slate-900 border border-slate-800 p-4 rounded-lg flex justify-between">
                                <span className="text-slate-400">{f.title}</span>
                                <span className="text-slate-600 text-xs">{f.module}</span>
                            </div>
                        ))}
                        {unchanged.length > 5 && (
                            <p className="text-center text-slate-500 text-sm">...and {unchanged.length - 5} more unchanged items</p>
                        )}
                    </div>
                </section>

            </div>
        </div>
    );
}
