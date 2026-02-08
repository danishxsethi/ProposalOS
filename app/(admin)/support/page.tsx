'use client';
import { useState } from 'react';

export default function SupportPage() {
    const [query, setQuery] = useState('');

    return (
        <div>
            <h1 className="text-2xl font-bold text-white mb-6">Support Tools</h1>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 max-w-2xl">
                <h3 className="text-white font-bold mb-4">Lookup Tenant / Audit</h3>
                <div className="flex gap-2">
                    <input
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2 text-white"
                        placeholder="UUID, Email, Business Name..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                    />
                    <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold transition">
                        Search
                    </button>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-bold mb-4">Common Actions</h3>
                    <div className="space-y-3">
                        <ActionButton label="Clear Cache: Specific URL" />
                        <ActionButton label="Re-queue Failed Audits (Last 1h)" />
                        <ActionButton label="Reset Tenant Rate Limits" />
                        <ActionButton label="Force Refresh Search Index" />
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <h3 className="text-white font-bold mb-4">Recent System Warnings</h3>
                    <div className="space-y-2 text-xs font-mono text-slate-400">
                        <div className="p-2 bg-slate-950 border border-slate-800 rounded flex justify-between">
                            <span>API Rate Limit (Serper)</span>
                            <span className="text-yellow-500">Warning</span>
                        </div>
                        <div className="p-2 bg-slate-950 border border-slate-800 rounded flex justify-between">
                            <span>Slow Response: /api/v1/audit</span>
                            <span className="text-orange-500">6.2s</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ActionButton({ label }: { label: string }) {
    return (
        <button className="w-full text-left px-4 py-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-sm text-slate-300 transition flex justify-between items-center group">
            {label}
            <span className="opacity-0 group-hover:opacity-100 transition">→</span>
        </button>
    );
}
