/**
 * Revenue Drill-Down
 * Requirements: 8.3, 8.5, 8.7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface RevenueData {
  current: {
    mrr: number;
    arr: number;
    newRevenue: number;
    churnedRevenue: number;
    netNewRevenue: number;
    revenueByTier: { starter: number; growth: number; pro: number };
    mrrGrowthRate: number;
  };
  history: { month: string; mrr: number; newRevenue: number; churnedRevenue: number }[];
}

function currency(n: number) { return `$${n.toLocaleString()}`; }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

function exportCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'revenue.csv';
  a.click();
}

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/platform/dashboard/revenue');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div className="animate-pulse h-64 bg-slate-800 rounded-xl" />;
  if (!data) return <p className="text-slate-400">Failed to load revenue data.</p>;

  const { current, history } = data;
  const maxMrr = Math.max(...history.map(h => h.mrr));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <button onClick={() => exportCSV(history as unknown as Record<string, unknown>[])} className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition">
          ⬇️ Export
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">MRR</p>
          <p className="text-3xl font-bold text-white">{currency(current.mrr)}</p>
          <p className="text-xs text-emerald-400 mt-1">+{pct(current.mrrGrowthRate)} MoM</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">ARR</p>
          <p className="text-3xl font-bold text-white">{currency(current.arr)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">New Revenue</p>
          <p className="text-3xl font-bold text-emerald-400">+{currency(current.newRevenue)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <p className="text-xs text-slate-400 mb-1">Churned Revenue</p>
          <p className="text-3xl font-bold text-red-400">-{currency(current.churnedRevenue)}</p>
        </div>
      </div>

      {/* Revenue by Tier */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">Revenue by Tier</h2>
        <div className="space-y-3">
          {Object.entries(current.revenueByTier).map(([tier, val]) => {
            const share = val / current.mrr;
            return (
              <div key={tier}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300 capitalize">{tier}</span>
                  <span className="text-white">{currency(val)} <span className="text-slate-500">({pct(share)})</span></span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${share * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MRR History Chart (bar) */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <h2 className="text-sm font-medium text-slate-300 mb-4">12-Month MRR Trend</h2>
        <div className="flex items-end gap-2 h-32">
          {history.map(row => {
            const h = Math.max(4, (row.mrr / maxMrr) * 100);
            return (
              <div key={row.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-indigo-500 rounded-t" style={{ height: `${h}%` }} title={currency(row.mrr)} />
                <span className="text-xs text-slate-500 rotate-45 origin-left">{row.month.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Month</th>
              <th className="text-right px-4 py-3">MRR</th>
              <th className="text-right px-4 py-3">New Revenue</th>
              <th className="text-right px-4 py-3">Churned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {[...history].reverse().map(row => (
              <tr key={row.month} className="hover:bg-slate-800/50 transition">
                <td className="px-4 py-3 text-slate-300">{row.month}</td>
                <td className="px-4 py-3 text-right text-white">{currency(row.mrr)}</td>
                <td className="px-4 py-3 text-right text-emerald-400">+{currency(row.newRevenue)}</td>
                <td className="px-4 py-3 text-right text-red-400">-{currency(row.churnedRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
