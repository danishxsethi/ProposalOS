'use client';

import { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { format, subDays } from 'date-fns';

export default function AnalyticsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState('30'); // days

    const fetchData = async () => {
        setLoading(true);
        try {
            const from = subDays(new Date(), parseInt(dateRange)).toISOString();
            const res = await fetch(`/api/analytics?from=${from}`);
            const json = await res.json();
            setData(json);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateRange]);

    const handleExport = () => {
        if (!data) return;
        const csvContent = "data:text/csv;charset=utf-8,"
            + "Metric,Value\n"
            + `Total Audits,${data.overview.totalAudits}\n`
            + `Total Revenue,${data.overview.totalRevenue}\n`
            + `Avg Cost,${data.overview.avgCostPerAudit}\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "analytics_export.csv");
        document.body.appendChild(link);
        link.click();
    };

    if (loading || !data) {
        return <div className="p-10 text-center text-slate-500">Loading analytics...</div>;
    }

    return (
        <div className="container max-w-7xl mx-auto py-10 px-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Performance Analytics</h1>
                    <p className="text-slate-400">Track your agency's growth and pipeline health.</p>
                </div>
                <div className="flex gap-3">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="bg-slate-800 border border-slate-700 text-slate-300 rounded px-3 py-2 text-sm"
                    >
                        <option value="7">Last 7 Days</option>
                        <option value="30">Last 30 Days</option>
                        <option value="90">Last 90 Days</option>
                    </select>
                    <button
                        onClick={handleExport}
                        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={fetchData}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <StatCard label="Total Audits" value={data.overview.totalAudits} />
                <StatCard label="Proposals Sent" value={data.overview.totalProposals} />
                <StatCard label="View Rate" value={`${data.overview.viewRate.toFixed(1)}%`} />
                <StatCard label="Close Rate" value={`${data.overview.closeRate.toFixed(1)}%`} />
                <StatCard label="Revenue" value={`$${data.overview.totalRevenue.toLocaleString()}`} highlight />
                <StatCard label="Avg Cost / Audit" value={`$${data.overview.avgCostPerAudit.toFixed(2)}`} />
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-8">
                {/* Weekly Trends */}
                <div className="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-6">Audits & Proposals (Weekly)</h3>
                    <div className="h-64 cursor-default">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.trends}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickFormatter={str => format(new Date(str), 'MMM d')} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                                    itemStyle={{ color: '#f1f5f9' }}
                                />
                                <Line type="monotone" dataKey="audits" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Audits Created" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Pipeline Funnel */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-6">Pipeline Funnel</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.funnel} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                                <YAxis dataKey="stage" type="category" stroke="#94a3b8" fontSize={12} width={80} />
                                <RechartsTooltip
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                                />
                                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={32}>
                                    {data.funnel.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={['#60a5fa', '#818cf8', '#a78bfa', '#c084fc'][index % 4]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Module Performance */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 overflow-hidden">
                    <h3 className="text-lg font-bold text-white mb-4">Module Reliability</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50 text-slate-400 text-sm">
                                <tr>
                                    <th className="px-4 py-3">Module</th>
                                    <th className="px-4 py-3 text-right">Success Rate</th>
                                    <th className="px-4 py-3 text-right">Runs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {data.modulePerformance.map((mod: any) => (
                                    <tr key={mod.name} className="text-sm">
                                        <td className="px-4 py-3 text-slate-300 capitalize">{mod.name}</td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <span className={mod.successRate < 90 ? 'text-red-400' : 'text-green-400'}>
                                                    {mod.successRate.toFixed(1)}%
                                                </span>
                                                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${mod.successRate < 90 ? 'bg-red-500' : 'bg-green-500'}`}
                                                        style={{ width: `${mod.successRate}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-400">{mod.total}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Top Findings */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 overflow-hidden">
                    <h3 className="text-lg font-bold text-white mb-4">Common Findings</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50 text-slate-400 text-sm">
                                <tr>
                                    <th className="px-4 py-3">Finding</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-right">Count</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700">
                                {data.topFindings.map((f: any, i: number) => (
                                    <tr key={i} className="text-sm">
                                        <td className="px-4 py-3 text-slate-300 font-medium">{f.title}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs border ${f.type === 'PAINKILLER'
                                                    ? 'bg-red-900/30 text-red-400 border-red-800'
                                                    : 'bg-green-900/30 text-green-400 border-green-800'
                                                }`}>
                                                {f.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-400">{f.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    );
}

function StatCard({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) {
    return (
        <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl">
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-2xl font-bold ${highlight ? 'text-green-400' : 'text-white'}`}>{value}</p>
        </div>
    );
}
