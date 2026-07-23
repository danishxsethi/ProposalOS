/**
 * Agency Admin Dashboard — Overview
 * Real-time pipeline metrics with polling, drill-down views, alert thresholds, and export.
 * Requirements: 8.1, 8.5, 8.6, 8.7, 8.8
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineMetrics {
  current: {
    prospectsDiscovered: number;
    auditsCompleted: number;
    proposalsGenerated: number;
    emailsSent: number;
    conversionRate: number;
    openRate: number;
    replyRate: number;
  };
  history: { date: string; prospectsDiscovered: number; auditsCompleted: number; proposalsGenerated: number; emailsSent: number }[];
  updatedAt: string;
}

interface ClientSummary {
  activeClients: number;
  averageSatisfactionScore: number;
  deliverableCompletionRate: number;
  atRiskClients: number;
  churningClients: number;
}

interface RevenueSummary {
  mrr: number;
  arr: number;
  newRevenue: number;
  churnedRevenue: number;
  netNewRevenue: number;
  revenueByTier: { starter: number; growth: number; pro: number };
  mrrGrowthRate: number;
}

interface AlertThreshold {
  metric: string;
  label: string;
  value: number;
  threshold: number;
  unit: string;
  status: 'ok' | 'warning' | 'critical';
}

// ─── Alert Threshold Config (configurable) ────────────────────────────────────

const DEFAULT_THRESHOLDS: Record<string, number> = {
  conversionRate: 0.04,
  openRate: 0.35,
  replyRate: 0.08,
  deliverableCompletionRate: 0.80,
  averageSatisfactionScore: 3.5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString(); }
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function currency(n: number) { return `$${n.toLocaleString()}`; }

function alertStatus(value: number, threshold: number): 'ok' | 'warning' | 'critical' {
  if (value >= threshold) return 'ok';
  if (value >= threshold * 0.85) return 'warning';
  return 'critical';
}

function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, trend }: { icon: string; label: string; value: string; sub?: string; trend?: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {trend && <span className="text-xs text-emerald-400 font-medium">{trend}</span>}
      </div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

function AlertBadge({ status }: { status: 'ok' | 'warning' | 'critical' }) {
  const map = { ok: 'bg-emerald-500/20 text-emerald-400', warning: 'bg-yellow-500/20 text-yellow-400', critical: 'bg-red-500/20 text-red-400' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status]}`}>{status}</span>;
}

function MiniBar({ value, max, color = 'bg-indigo-500' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full bg-slate-700 rounded-full h-1.5 mt-1">
      <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function SparkLine({ data, field }: { data: { date: string; [k: string]: number | string }[]; field: string }) {
  const values = data.map(d => Number(d[field]));
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 120, h = 32, pts = values.length;
  const points = values.map((v, i) => {
    const x = (i / (pts - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline fill="none" stroke="#6366f1" strokeWidth="1.5" points={points} />
    </svg>
  );
}

// ─── Main Dashboard Component ─────────────────────────────────────────────────

export default function AgencyDashboard() {
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [clientSummary, setClientSummary] = useState<ClientSummary | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [draftThresholds, setDraftThresholds] = useState(DEFAULT_THRESHOLDS);
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchAll = useCallback(async () => {
    try {
      const [mRes, cRes, rRes] = await Promise.all([
        fetch('/api/platform/dashboard/metrics'),
        fetch('/api/platform/dashboard/clients'),
        fetch('/api/platform/dashboard/revenue'),
      ]);
      if (mRes.ok) setMetrics(await mRes.json());
      if (cRes.ok) { const d = await cRes.json(); setClientSummary(d.summary); }
      if (rRes.ok) { const d = await rRes.json(); setRevenue(d.current); }
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Poll every 30 seconds (SSE/WebSocket pattern — no page refresh)
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Build alert thresholds from live data
  const alerts: AlertThreshold[] = metrics && clientSummary ? [
    { metric: 'conversionRate', label: 'Conversion Rate', value: metrics.current.conversionRate, threshold: thresholds.conversionRate, unit: '%', status: alertStatus(metrics.current.conversionRate, thresholds.conversionRate) },
    { metric: 'openRate', label: 'Email Open Rate', value: metrics.current.openRate, threshold: thresholds.openRate, unit: '%', status: alertStatus(metrics.current.openRate, thresholds.openRate) },
    { metric: 'replyRate', label: 'Reply Rate', value: metrics.current.replyRate, threshold: thresholds.replyRate, unit: '%', status: alertStatus(metrics.current.replyRate, thresholds.replyRate) },
    { metric: 'deliverableCompletionRate', label: 'Deliverable Completion', value: clientSummary.deliverableCompletionRate, threshold: thresholds.deliverableCompletionRate, unit: '%', status: alertStatus(clientSummary.deliverableCompletionRate, thresholds.deliverableCompletionRate) },
    { metric: 'averageSatisfactionScore', label: 'Avg Satisfaction', value: clientSummary.averageSatisfactionScore, threshold: thresholds.averageSatisfactionScore, unit: '/5', status: alertStatus(clientSummary.averageSatisfactionScore, thresholds.averageSatisfactionScore) },
  ] : [];

  const activeAlerts = alerts.filter(a => a.status !== 'ok');

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-slate-800 rounded w-1/3" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-800 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Agency Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Live pipeline performance · Last updated {lastUpdated}
            <span className="ml-2 inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setEditingThresholds(true)}
            className="text-sm px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-600"
          >
            ⚙️ Alert Thresholds
          </button>
          <button
            onClick={() => metrics && exportCSV('pipeline-metrics.csv', metrics.history)}
            className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition"
          >
            ⬇️ Export
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Active Alerts Banner */}
      {activeAlerts.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-yellow-300 font-medium text-sm mb-2">⚠️ {activeAlerts.length} metric{activeAlerts.length > 1 ? 's' : ''} below threshold</p>
          <div className="flex flex-wrap gap-2">
            {activeAlerts.map(a => (
              <span key={a.metric} className="text-xs bg-yellow-500/10 text-yellow-300 px-2 py-1 rounded">
                {a.label}: {a.unit === '%' ? pct(a.value) : `${a.value}${a.unit}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Metrics */}
      {metrics && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-200">Pipeline Metrics</h2>
            <button onClick={() => setDrillDown(drillDown === 'pipeline' ? null : 'pipeline')} className="text-xs text-indigo-400 hover:text-indigo-300">
              {drillDown === 'pipeline' ? 'Hide trends ↑' : 'Show trends ↓'}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="👥" label="Prospects Discovered" value={fmt(metrics.current.prospectsDiscovered)} sub="today" trend="+12%" />
            <StatCard icon="🔍" label="Audits Completed" value={fmt(metrics.current.auditsCompleted)} sub="today" trend="+8%" />
            <StatCard icon="📄" label="Proposals Generated" value={fmt(metrics.current.proposalsGenerated)} sub="today" trend="+15%" />
            <StatCard icon="📧" label="Emails Sent" value={fmt(metrics.current.emailsSent)} sub="today" trend="+5%" />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <StatCard icon="📬" label="Open Rate" value={pct(metrics.current.openRate)} sub={`Target: ${pct(thresholds.openRate)}`} />
            <StatCard icon="↩️" label="Reply Rate" value={pct(metrics.current.replyRate)} sub={`Target: ${pct(thresholds.replyRate)}`} />
            <StatCard icon="🎯" label="Conversion Rate" value={pct(metrics.current.conversionRate)} sub={`Target: ${pct(thresholds.conversionRate)}`} />
          </div>

          {/* Drill-down: historical trends */}
          {drillDown === 'pipeline' && (
            <div className="mt-4 bg-slate-900 border border-slate-700 rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-300 mb-4">30-Day Trends</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {(['prospectsDiscovered', 'auditsCompleted', 'proposalsGenerated', 'emailsSent'] as const).map(field => (
                  <div key={field}>
                    <p className="text-xs text-slate-400 mb-2 capitalize">{field.replace(/([A-Z])/g, ' $1')}</p>
                    <SparkLine data={metrics.history} field={field} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => exportCSV('pipeline-history.csv', metrics.history)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  Export history CSV →
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Client Health + Revenue side by side */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Client Health */}
        {clientSummary && (
          <section className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-200">Client Health</h2>
              <div className="flex gap-2">
                <Link href="/agency/dashboard/clients" className="text-xs text-indigo-400 hover:text-indigo-300">View all →</Link>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Active Clients</span>
                  <span className="text-white font-medium">{clientSummary.activeClients}</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Avg Satisfaction</span>
                  <span className="text-white font-medium">{clientSummary.averageSatisfactionScore.toFixed(1)} / 5</span>
                </div>
                <MiniBar value={clientSummary.averageSatisfactionScore} max={5} color="bg-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-400">Deliverable Completion</span>
                  <span className="text-white font-medium">{pct(clientSummary.deliverableCompletionRate)}</span>
                </div>
                <MiniBar value={clientSummary.deliverableCompletionRate} max={1} color="bg-indigo-500" />
              </div>
              <div className="flex gap-4 pt-2 border-t border-slate-700">
                <div className="text-center">
                  <p className="text-yellow-400 font-bold text-lg">{clientSummary.atRiskClients}</p>
                  <p className="text-xs text-slate-400">At Risk</p>
                </div>
                <div className="text-center">
                  <p className="text-red-400 font-bold text-lg">{clientSummary.churningClients}</p>
                  <p className="text-xs text-slate-400">Churning</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Revenue */}
        {revenue && (
          <section className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-200">Revenue</h2>
              <Link href="/agency/dashboard/revenue" className="text-xs text-indigo-400 hover:text-indigo-300">Details →</Link>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs text-slate-400">MRR</p>
                  <p className="text-3xl font-bold text-white">{currency(revenue.mrr)}</p>
                </div>
                <span className="text-emerald-400 text-sm font-medium">+{pct(revenue.mrrGrowthRate)} MoM</span>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700">
                <div>
                  <p className="text-xs text-slate-400">New Revenue</p>
                  <p className="text-emerald-400 font-semibold">+{currency(revenue.newRevenue)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Churned Revenue</p>
                  <p className="text-red-400 font-semibold">-{currency(revenue.churnedRevenue)}</p>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-400 mb-2">Revenue by Tier</p>
                {Object.entries(revenue.revenueByTier).map(([tier, val]) => (
                  <div key={tier} className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300 capitalize">{tier}</span>
                    <span className="text-white">{currency(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Alert Thresholds Panel */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-200">Alert Thresholds</h2>
          <button onClick={() => { setDraftThresholds(thresholds); setEditingThresholds(true); }} className="text-xs text-indigo-400 hover:text-indigo-300">
            Configure →
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {alerts.map(a => (
            <div key={a.metric} className="bg-slate-800 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">{a.label}</p>
              <p className="text-white font-semibold text-sm">{a.unit === '%' ? pct(a.value) : `${a.value}${a.unit}`}</p>
              <p className="text-xs text-slate-500">min: {a.unit === '%' ? pct(a.threshold) : `${a.threshold}${a.unit}`}</p>
              <div className="mt-2"><AlertBadge status={a.status} /></div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Links */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/agency/dashboard/ai-decisions" className="bg-slate-900 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 transition group">
          <p className="text-2xl mb-2">🤖</p>
          <p className="text-sm font-medium text-slate-200 group-hover:text-white">AI Decisions</p>
          <p className="text-xs text-slate-500">Why prospects were prioritized</p>
        </Link>
        <Link href="/agency/dashboard/clients" className="bg-slate-900 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 transition group">
          <p className="text-2xl mb-2">👥</p>
          <p className="text-sm font-medium text-slate-200 group-hover:text-white">All Clients</p>
          <p className="text-xs text-slate-500">Health & deliverable status</p>
        </Link>
        <Link href="/agency/dashboard/revenue" className="bg-slate-900 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 transition group">
          <p className="text-2xl mb-2">💰</p>
          <p className="text-sm font-medium text-slate-200 group-hover:text-white">Revenue</p>
          <p className="text-xs text-slate-500">MRR trends & tier breakdown</p>
        </Link>
        <button
          onClick={() => metrics && exportCSV('full-report.csv', metrics.history)}
          className="bg-slate-900 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 transition group text-left"
        >
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm font-medium text-slate-200 group-hover:text-white">Export Report</p>
          <p className="text-xs text-slate-500">Download all metrics as CSV</p>
        </button>
      </section>

      {/* Alert Threshold Modal */}
      {editingThresholds && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-4">Configure Alert Thresholds</h3>
            <div className="space-y-4">
              {Object.entries(draftThresholds).map(([key, val]) => {
                const label = alerts.find(a => a.metric === key)?.label ?? key;
                const isPercent = key !== 'averageSatisfactionScore';
                return (
                  <div key={key}>
                    <label className="text-sm text-slate-300 block mb-1">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step={isPercent ? '0.01' : '0.1'}
                        min={0}
                        max={isPercent ? 1 : 5}
                        value={val}
                        onChange={e => setDraftThresholds(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                      />
                      <span className="text-slate-400 text-sm">{isPercent ? '(0–1)' : '(0–5)'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setThresholds(draftThresholds); setEditingThresholds(false); }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium transition"
              >
                Save
              </button>
              <button
                onClick={() => setEditingThresholds(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg py-2 text-sm transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
