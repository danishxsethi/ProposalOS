'use client';
import { useState } from 'react';

export default function HealthPage() {
    return (
        <div className="max-w-5xl">
            <h1 className="text-2xl font-bold text-white mb-6">System Health</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <StatusCard name="Database (Prisma)" status="ONLINE" latency="4ms" />
                <StatusCard name="Orchestrator" status="ONLINE" latency="12ms" />
                <StatusCard name="LLM Gateway (Gemini)" status="ONLINE" latency="850ms" />
                <StatusCard name="Google Search API" status="ONLINE" latency="320ms" />
                <StatusCard name="Email Service (Resend)" status="ONLINE" latency="-" />
                <StatusCard name="Job Queue" status="HEALTHY" latency="0 pending" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <h3 className="text-white font-bold mb-4">Module Reliability (Last 24h)</h3>
                <div className="space-y-4">
                    <ProgressBar label="Website Crawler" percent={98} color="bg-green-500" />
                    <ProgressBar label="Google Business Profile" percent={92} color="bg-green-500" />
                    <ProgressBar label="PageSpeed Insights" percent={99} color="bg-green-500" />
                    <ProgressBar label="Competitor Analysis" percent={85} color="bg-yellow-500" note="Rate limiting detected" />
                </div>
            </div>
        </div>
    );
}

function StatusCard({ name, status, latency }: { name: string, status: string, latency: string }) {
    const isOnline = status === 'ONLINE' || status === 'HEALTHY';
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
                <div className="text-slate-400 text-xs font-bold uppercase mb-1">{name}</div>
                <div className="text-white font-bold">{status}</div>
            </div>
            <div className={`text-right ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
                <div className="w-3 h-3 rounded-full bg-current ml-auto mb-1 animate-pulse" />
                <div className="text-xs opacity-70">{latency}</div>
            </div>
        </div>
    );
}

function ProgressBar({ label, percent, color, note }: { label: string, percent: number, color: string, note?: string }) {
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">{label}</span>
                <span className="text-white font-mono">{percent}% Success</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                <div className={`${color} h-full`} style={{ width: `${percent}%` }} />
            </div>
            {note && <div className="text-xs text-yellow-500 mt-1">{note}</div>}
        </div>
    );
}
