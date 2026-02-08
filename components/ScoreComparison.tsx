'use client';

export function ScoreComparison({ score, city, industry }: { score: number, city: string, industry: string }) {
    // Mock Data - In real app, fetch percentile from DB
    // e.g. Count audits in city/industry with score < this.score
    const percentile = 22; // "Bottom 22%"
    const totalAudited = 142;

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                <span>📍</span>
                Market Comparison: {city}
            </h3>

            <div className="flex items-center gap-6">
                <div className="flex-1">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Your Score</span>
                        <span className="text-white font-bold">{score}</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
                        <div
                            className="absolute top-0 bottom-0 bg-indigo-500 rounded-full"
                            style={{ left: \`\${Math.max(0, score - 5)}%\`, right: \`\${100 - score - 5}%\` }}
                        />
                        {/* Markers for average */}
                        <div className="absolute top-0 bottom-0 w-1 bg-yellow-500 left-[65%]" title="Industry Avg" />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>0</span>
                        <span className="text-yellow-500">Avg (65)</span>
                        <span>100</span>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-2xl font-black text-white">{totalAudited}</div>
                    <div className="text-xs text-slate-400">Businesses Audited</div>
                </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-200 flex gap-3">
                <span className="text-xl">💡</span>
                <p>
                    You are currently in the <strong>bottom {percentile}%</strong> of {industry} businesses in {city}.
                    Competitors are actively optimizing their profiles.
                </p>
            </div>
        </div>
    );
}
