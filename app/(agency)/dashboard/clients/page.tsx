/**
 * Client Health Drill-Down
 * Requirements: 8.2, 8.5, 8.7
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

interface Client {
  id: string;
  name: string;
  tier: string;
  satisfactionScore: number;
  deliverablesCompleted: number;
  deliverablesTotal: number;
  status: 'healthy' | 'at-risk' | 'churning';
}

interface ClientData {
  summary: {
    activeClients: number;
    averageSatisfactionScore: number;
    deliverableCompletionRate: number;
    atRiskClients: number;
    churningClients: number;
  };
  clients: Client[];
  history: { date: string; activeClients: number; satisfactionScore: number; deliverableCompletionRate: number }[];
}

function statusColor(s: Client['status']) {
  return { healthy: 'text-emerald-400', 'at-risk': 'text-yellow-400', churning: 'text-red-400' }[s];
}

function exportCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'clients.csv';
  a.click();
}

export default function ClientsPage() {
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/platform/dashboard/clients');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div className="animate-pulse h-64 bg-slate-800 rounded-xl" />;
  if (!data) return <p className="text-slate-400">Failed to load client data.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Client Health</h1>
        <div className="flex gap-3">
          <button onClick={() => setShowHistory(!showHistory)} className="text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 transition">
            {showHistory ? 'Hide' : 'Show'} Trends
          </button>
          <button onClick={() => exportCSV(data.clients as unknown as Record<string, unknown>[])} className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition">
            ⬇️ Export
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Active Clients', value: data.summary.activeClients },
          { label: 'Avg Satisfaction', value: `${data.summary.averageSatisfactionScore.toFixed(1)}/5` },
          { label: 'Deliverable Completion', value: `${(data.summary.deliverableCompletionRate * 100).toFixed(0)}%` },
          { label: 'At Risk', value: data.summary.atRiskClients },
          { label: 'Churning', value: data.summary.churningClients },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className="text-xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Historical Trends */}
      {showHistory && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-medium text-slate-300 mb-4">30-Day History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 pr-4">Date</th>
                  <th className="text-right py-2 pr-4">Active Clients</th>
                  <th className="text-right py-2 pr-4">Satisfaction</th>
                  <th className="text-right py-2">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.history.slice(-10).map(row => (
                  <tr key={row.date} className="border-b border-slate-800">
                    <td className="py-2 pr-4 text-slate-400">{row.date}</td>
                    <td className="py-2 pr-4 text-right">{row.activeClients}</td>
                    <td className="py-2 pr-4 text-right">{row.satisfactionScore.toFixed(2)}</td>
                    <td className="py-2 text-right">{(row.deliverableCompletionRate * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Client Table */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Client</th>
              <th className="text-left px-4 py-3">Tier</th>
              <th className="text-right px-4 py-3">Satisfaction</th>
              <th className="text-right px-4 py-3">Deliverables</th>
              <th className="text-right px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.clients.map(c => (
              <tr key={c.id} className="hover:bg-slate-800/50 transition">
                <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                <td className="px-4 py-3 text-slate-400 capitalize">{c.tier}</td>
                <td className="px-4 py-3 text-right text-slate-300">{c.satisfactionScore.toFixed(1)}</td>
                <td className="px-4 py-3 text-right text-slate-300">{c.deliverablesCompleted}/{c.deliverablesTotal}</td>
                <td className={`px-4 py-3 text-right font-medium capitalize ${statusColor(c.status)}`}>{c.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
