'use client';

import { useState, useEffect } from 'react';
import type {
  MoatReport,
  MoatDimension,
  DataMoat,
  SpeedMoat,
  CostMoat,
  NetworkMoat,
  BrandMoat,
} from '@/lib/platform/metrics/moatMetrics';
import type { NegativeTrend, AlertRecord } from '@/lib/platform/metrics/moatAlerting';

interface MoatData {
  report: MoatReport;
  negativeTrends: NegativeTrend[];
  activeAlerts: AlertRecord[];
  catchUpTimes: Record<string, number>;
}

export default function MoatDashboardPage() {
  const [data, setData] = useState<MoatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/moats')
      .then((res) => res.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-12 text-center text-slate-500">Loading moat metrics...</div>;
  if (error || !data) return <div className="p-12 text-center text-red-500">{error ?? 'Failed to load data.'}</div>;

  const { report, negativeTrends, activeAlerts, catchUpTimes } = data;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white">Competitive Moat Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded text-sm font-bold text-slate-300"
        >
          Export PDF
        </button>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-5">
          <h2 className="text-red-400 font-bold text-sm uppercase tracking-wider mb-3">
            ⚠ Active Alerts — Declining Metrics
          </h2>
          <div className="space-y-2">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 text-sm">
                <span className="text-red-500 font-mono text-xs mt-0.5">{alert.id}</span>
                <span className="text-red-300">{alert.trendDescription}</span>
                <span className="text-red-600 text-xs ml-auto whitespace-nowrap">
                  {new Date(alert.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negative Trends (no alert yet but detected) */}
      {negativeTrends.length > 0 && activeAlerts.length === 0 && (
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-5">
          <h2 className="text-yellow-400 font-bold text-sm uppercase tracking-wider mb-3">
            ⚡ Negative Trends Detected
          </h2>
          <div className="space-y-1">
            {negativeTrends.map((t) => (
              <p key={t.metric} className="text-yellow-300 text-sm">{t.description}</p>
            ))}
          </div>
        </div>
      )}

      {/* Five Moat Dimension Cards */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
        <DataMoatCard dimension={report.data} catchUpWeeks={catchUpTimes.data} />
        <SpeedMoatCard dimension={report.speed} catchUpWeeks={catchUpTimes.speed} />
        <CostMoatCard dimension={report.cost} catchUpWeeks={catchUpTimes.cost} />
        <NetworkMoatCard dimension={report.network} catchUpWeeks={catchUpTimes.network} />
        <BrandMoatCard dimension={report.brand} catchUpWeeks={catchUpTimes.brand} />
      </div>

      <div className="text-xs text-slate-600 text-center pt-4">
        Confidential — Internal Use Only
      </div>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  const styles = {
    improving: 'bg-green-900 text-green-400',
    stable: 'bg-slate-800 text-slate-400',
    declining: 'bg-red-900 text-red-400',
  };
  const icons = { improving: '↑', stable: '→', declining: '↓' };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded ${styles[trend]}`}>
      {icons[trend]} {trend}
    </span>
  );
}

function CatchUpBadge({ weeks }: { weeks: number }) {
  if (!isFinite(weeks) || weeks === 0) {
    return (
      <div className="text-xs text-slate-500 mt-2">
        Catch-up time: <span className="text-green-400 font-bold">∞ (moat growing)</span>
      </div>
    );
  }
  const color = weeks > 52 ? 'text-green-400' : weeks > 12 ? 'text-yellow-400' : 'text-red-400';
  return (
    <div className="text-xs text-slate-500 mt-2">
      Competitor catch-up: <span className={`font-bold ${color}`}>{weeks} weeks</span>
    </div>
  );
}

function MoatCard({
  title,
  trend,
  catchUpWeeks,
  children,
}: {
  title: string;
  trend: 'improving' | 'stable' | 'declining';
  catchUpWeeks: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold">{title}</h3>
        <TrendBadge trend={trend} />
      </div>
      {children}
      <CatchUpBadge weeks={catchUpWeeks} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white font-bold text-sm">{value}</span>
    </div>
  );
}

// ─── Dimension cards ───────────────────────────────────────────────────────────

function DataMoatCard({
  dimension,
  catchUpWeeks,
}: {
  dimension: MoatDimension<DataMoat>;
  catchUpWeeks: number;
}) {
  const { data } = dimension;
  return (
    <MoatCard title="📊 Data Moat" trend={dimension.weekOverWeekTrend} catchUpWeeks={catchUpWeeks}>
      <div className="space-y-1">
        <Metric label="Total Audits Completed" value={data.totalAuditsCompleted.toLocaleString()} />
        <Metric label="Unique Outcome Data Points" value={data.uniqueOutcomeDataPoints.toLocaleString()} />
        <Metric
          label="WoW Growth"
          value={`${(data.weekOverWeekGrowth * 100).toFixed(1)}%`}
        />
      </div>
    </MoatCard>
  );
}

function SpeedMoatCard({
  dimension,
  catchUpWeeks,
}: {
  dimension: MoatDimension<SpeedMoat>;
  catchUpWeeks: number;
}) {
  const { data } = dimension;
  return (
    <MoatCard title="⚡ Speed Moat" trend={dimension.weekOverWeekTrend} catchUpWeeks={catchUpWeeks}>
      <div className="space-y-1">
        <Metric label="Avg Audit Time" value={`${(data.averageAuditTimeMs / 1000).toFixed(1)}s`} />
        <Metric label="p95 Latency" value={`${(data.p95LatencyMs / 1000).toFixed(1)}s`} />
        <Metric
          label="WoW Improvement"
          value={`${data.weekOverWeekImprovementMs > 0 ? '-' : '+'}${Math.abs(data.weekOverWeekImprovementMs)}ms`}
        />
      </div>
    </MoatCard>
  );
}

function CostMoatCard({
  dimension,
  catchUpWeeks,
}: {
  dimension: MoatDimension<CostMoat>;
  catchUpWeeks: number;
}) {
  const { data } = dimension;
  const trendColor =
    data.costTrend === 'decreasing'
      ? 'text-green-400'
      : data.costTrend === 'increasing'
      ? 'text-red-400'
      : 'text-slate-400';

  return (
    <MoatCard title="💰 Cost Moat" trend={dimension.weekOverWeekTrend} catchUpWeeks={catchUpWeeks}>
      <div className="space-y-1">
        <Metric label="Cost per Audit" value={`$${(data.costPerAuditCents / 100).toFixed(4)}`} />
        <div className="flex justify-between items-center py-1 border-b border-slate-800">
          <span className="text-slate-400 text-sm">Cost Trend</span>
          <span className={`font-bold text-sm ${trendColor}`}>{data.costTrend}</span>
        </div>
      </div>
      {data.weeklyHistory.length > 1 && (
        <MiniSparkline values={data.weeklyHistory} lowerIsBetter />
      )}
    </MoatCard>
  );
}

function NetworkMoatCard({
  dimension,
  catchUpWeeks,
}: {
  dimension: MoatDimension<NetworkMoat>;
  catchUpWeeks: number;
}) {
  const { data } = dimension;
  return (
    <MoatCard title="🌐 Network Moat" trend={dimension.weekOverWeekTrend} catchUpWeeks={catchUpWeeks}>
      <div className="space-y-1">
        <Metric label="Agencies on Platform" value={data.agenciesOnPlatform.toLocaleString()} />
        <Metric
          label="Cross-Tenant Lift"
          value={`+${(data.crossTenantLearningLift * 100).toFixed(1)}%`}
        />
        <Metric
          label="WoW Agency Growth"
          value={`${(data.weekOverWeekAgencyGrowth * 100).toFixed(1)}%`}
        />
      </div>
    </MoatCard>
  );
}

function BrandMoatCard({
  dimension,
  catchUpWeeks,
}: {
  dimension: MoatDimension<BrandMoat>;
  catchUpWeeks: number;
}) {
  const { data } = dimension;
  return (
    <MoatCard title="🏆 Brand Moat" trend={dimension.weekOverWeekTrend} catchUpWeeks={catchUpWeeks}>
      <div className="space-y-1">
        <Metric label="Case Studies Published" value={data.caseStudiesPublished.toLocaleString()} />
        <Metric label="Brand Mentions" value={data.brandMentions.toLocaleString()} />
        <Metric
          label="WoW Mention Growth"
          value={`${(data.weekOverWeekMentionGrowth * 100).toFixed(1)}%`}
        />
      </div>
    </MoatCard>
  );
}

// ─── Mini sparkline (SVG) ──────────────────────────────────────────────────────

function MiniSparkline({ values, lowerIsBetter = false }: { values: number[]; lowerIsBetter?: boolean }) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 200;
  const h = 40;
  const pad = 4;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    // Normalize: higher value = higher y position (inverted for SVG)
    const normalized = (v - min) / range;
    const y = lowerIsBetter
      ? pad + normalized * (h - pad * 2)          // lower value = lower y = better
      : h - pad - normalized * (h - pad * 2);     // higher value = lower y = better
    return `${x},${y}`;
  });

  const polyline = points.join(' ');
  const lastPoint = points[points.length - 1];
  const [lx, ly] = lastPoint.split(',').map(Number);

  const lastVal = values[values.length - 1];
  const prevVal = values[values.length - 2];
  const improving = lowerIsBetter ? lastVal < prevVal : lastVal > prevVal;
  const strokeColor = improving ? '#4ade80' : '#f87171';

  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">Weekly cost history</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10">
        <polyline
          points={polyline}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lx} cy={ly} r="3" fill={strokeColor} />
      </svg>
    </div>
  );
}
