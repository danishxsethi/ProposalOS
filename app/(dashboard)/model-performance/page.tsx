'use client';

import React, { useEffect, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

export default function ModelPerformanceDashboard() {
    const [metrics, setMetrics] = useState<any>(null);

    useEffect(() => {
        fetch('/api/admin/model-metrics')
            .then(res => res.json())
            .then(data => setMetrics(data))
            .catch(console.error);
    }, []);

    if (!metrics) return <div className="p-8">Loading Model Telemetry...</div>;

    const COLORS = ['#10B981', '#6366F1'];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Model Performance & Canary Rollout</h1>
                <p className="text-gray-500">Real-time telemetry for Gemini 1.5 Pro vs 3.1 Pro</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Widget 1: Model Traffic Split */}
                <div className="border rounded-xl p-4 shadow-sm bg-white">
                    <h3 className="font-semibold mb-2">Traffic Split</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={metrics.split} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" label>
                                    {metrics.split.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Widget 2: Latency */}
                <div className="border rounded-xl p-4 shadow-sm bg-white lg:col-span-2">
                    <h3 className="font-semibold mb-2">P95 Latency (seconds)</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics.latency}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="pro15" stroke={COLORS[0]} name="Gemini 1.5 Pro" />
                                <Line type="monotone" dataKey="pro31" stroke={COLORS[1]} name="Gemini 3.1 Pro" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Widget 3: Quality Scores */}
                <div className="border rounded-xl p-4 shadow-sm bg-white lg:col-span-2">
                    <h3 className="font-semibold mb-2">AutoQA Average Score</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics.quality}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis domain={[80, 100]} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="pro15" stroke={COLORS[0]} name="Gemini 1.5 Pro" />
                                <Line type="monotone" dataKey="pro31" stroke={COLORS[1]} name="Gemini 3.1 Pro" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Widget 4: Cost Comparison */}
                <div className="border rounded-xl p-4 shadow-sm bg-white">
                    <h3 className="font-semibold mb-2">Average Cost per Audit</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.costs}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="model" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="avgCostCents" fill={COLORS[1]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Widget 5: Thinking Token Usage */}
                <div className="border rounded-xl p-4 shadow-sm bg-white lg:col-span-2">
                    <h3 className="font-semibold mb-2">Thinking Tokens by Pipeline Node</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.thinkingTokens}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="node" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="tokens" fill="#F59E0B" name="Thinking Tokens" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Widget 6: Error Rates */}
                <div className="border rounded-xl p-4 shadow-sm bg-white">
                    <h3 className="font-semibold mb-2">Error Counts</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics.errors}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="time" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="pro15" stroke={COLORS[0]} name="Gemini 1.5 Pro" />
                                <Line type="monotone" dataKey="pro31" stroke={COLORS[1]} name="Gemini 3.1 Pro" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
