/**
 * AI Decisions Drill-Down
 * Requirements: 8.4, 8.5, 8.7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface Factor {
  factor: string;
  value: string | number;
  contribution?: string;
  weight?: number;
}

interface Decision {
  id: string;
  prospectName: string;
  decisionType: 'prioritization' | 'email_variant';
  decision: string;
  reasoning: Factor[];
  modelVersion: string;
  decidedAt: string;
  variantSelected?: string;
  variantOpenRate?: number;
}

interface AIDecisionsData {
  decisions: Decision[];
  summary: {
    totalDecisionsToday: number;
    prioritizationDecisions: number;
    emailVariantDecisions: number;
    averageConfidence: number;
  };
}

function exportCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ai-decisions.csv';
  a.click();
}

function contributionColor(c?: string) {
  if (c === 'high') return 'text-emerald-400';
  if (c === 'medium') return 'text-yellow-400';
  return 'text-slate-400';
}

export default function AIDecisionsPage() {
  const [data, setData] = useState<AIDecisionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'prioritization' | 'email_variant'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/platform/dashboard/ai-decisions?limit=50');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div className="animate-pulse h-64 bg-slate-800 rounded-xl" />;
  if (!data) return <p className="text-slate-400">Failed to load AI decisions.</p>;

  const filtered = data.decisions.filter(d => filter === 'all' || d.decisionType === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">AI Decision Transparency</h1>
        <button
          onClick={() => exportCSV(data.decisions.map(d => ({ id: d.id, prospect: d.prospectName, type: d.decisionType, decision: d.decision, model: d.modelVersion, at: d.decidedAt })))}
          className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
        >
          ⬇️ Export
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Decisions Today', value: data.summary.totalDecisionsToday },
          { label: 'Prioritization', value: data.summary.prioritizationDecisions },
          { label: 'Email Variant', value: data.summary.emailVariantDecisions },
          { label: 'Avg Confidence', value: `${(data.summary.averageConfidence * 100).toFixed(0)}%` },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'prioritization', 'email_variant'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-4 py-2 rounded-lg transition capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Decision List */}
      <div className="space-y-3">
        {filtered.map(d => (
          <div key={d.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
            <button
              className="w-full text-left px-5 py-4 flex items-center justify-between hover:bg-slate-800/50 transition"
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{d.decisionType === 'prioritization' ? '🎯' : '📧'}</span>
                <div>
                  <p className="text-white font-medium">{d.prospectName}</p>
                  <p className="text-slate-400 text-sm">{d.decision}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-xs text-slate-500">{d.modelVersion}</p>
                  <p className="text-xs text-slate-500">{new Date(d.decidedAt).toLocaleTimeString()}</p>
                </div>
                <span className="text-slate-500">{expanded === d.id ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded === d.id && (
              <div className="px-5 pb-4 border-t border-slate-800">
                <p className="text-xs text-slate-400 mt-3 mb-2 uppercase tracking-wide">Reasoning Factors</p>
                <div className="space-y-2">
                  {d.reasoning.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{r.factor}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">{String(r.value)}</span>
                        {r.contribution && (
                          <span className={`text-xs font-medium ${contributionColor(r.contribution)}`}>
                            {r.contribution} impact
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {d.variantSelected && (
                  <p className="text-xs text-slate-400 mt-3">
                    Variant {d.variantSelected} selected · Open rate: {d.variantOpenRate ? `${(d.variantOpenRate * 100).toFixed(0)}%` : 'N/A'}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
