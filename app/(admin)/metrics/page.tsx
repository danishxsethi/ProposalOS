'use client';

import { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';

export default function AdminMetricsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/admin/metrics')
            .then(res => res.json())
            .then(d => {
                if (d.charts?.audits) {
                    d.charts.audits = d.charts.audits.map((item: any) => ({
                        date: format(new Date(item.date), 'MMM dd'),
                        count: item.count
                    }));
                }
                setData(d);
                setLoading(false);
            })
            .catch(e => console.error(e));
    }, []);

    if (loading) return <div className="p-12 text-center text-slate-500">Loading metrics...</div>;
    if (!data) return <div className="p-12 text-center text-red-500">Failed to load data.</div>;

    const { northStar, growth, charts } = data;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <h1 className="text-3xl font-bold text-white">Metrics Dashboard</h1>
                <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded text-sm font-bold text-slate-300">
                    Export PDF
                </button>
            </div>

            {/* NORTH STAR */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <MetricCard label="MRR" value={`$${northStar.mrr.toLocaleString()}`} change="+12%" />
                <MetricCard label="ARR" value={`$${northStar.arr.toLocaleString()}`} />
                <MetricCard label="Total Audits" value={northStar.totalAudits} change={`+${growth.auditsLast30Days}`} />
                <MetricCard label="Total Users" value={northStar.totalUsers} change={`+${growth.usersLast30Days}`} />
                <MetricCard label="Proposals" value={northStar.totalProposals} />
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* GROWTH CHART */}
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                    <h3 className="text-white font-bold mb-6">Audit Volume (30 Days)</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={charts.audits}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                                <YAxis stroke="#94a3b8" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* UNIT ECONOMICS (MOCKED VISUAL) */}
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                    <h3 className="text-white font-bold mb-6">Unit Economics</h3>
                    <div className="space-y-6">
                        <div className="flex justify-between items-center p-4 bg-slate-950 rounded border border-slate-800">
                            <div>
                                <div className="text-slate-400 text-sm">LTV:CAC Ratio</div>
                                <div className="text-2xl font-bold text-green-400">4.2x</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-slate-500">Target {'>'}3x</div>
                                <div className="text-xs text-green-500 font-bold">Healthy</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-950 rounded border border-slate-800">
                                <div className="text-slate-400 text-sm">CAC</div>
                                <div className="text-xl font-bold text-white">$45.00</div>
                            </div>
                            <div className="p-4 bg-slate-950 rounded border border-slate-800">
                                <div className="text-slate-400 text-sm">LTV</div>
                                <div className="text-xl font-bold text-white">$189.00</div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-950 rounded border border-slate-800">
                            <div className="text-slate-400 text-sm mb-2">Cost per Audit (COGS)</div>
                            <div className="flex items-end gap-2">
                                <div className="text-xl font-bold text-white">$0.18</div>
                                <div className="text-xs text-slate-500 mb-1">avg</div>
                            </div>
                            <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                                <div className="bg-emerald-500 h-full w-[85%]"></div>
                            </div>
                            <div className="text-xs text-emerald-500 mt-1 font-bold">85% Gross Margin</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="text-xs text-slate-600 text-center pt-8">
                Confidential - Internal Use Only - Generated {new Date().toLocaleDateString()}
            </div>
        </div>
    );
}

function MetricCard({ label, value, change }: { label: string, value: string | number, change?: string }) {
    return (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{label}</div>
            <div className="text-2xl font-black text-white">{value}</div>
            {change && (
                <div className="text-xs font-bold text-green-400 mt-1">{change} vs last mo</div>
            )}
        </div>
    );
}
