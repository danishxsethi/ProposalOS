'use client';
import { useState } from 'react';

// Mock Flags for now
const INITIAL_FLAGS = [
    { id: 'new-crawler', name: 'New Crawler Engine (v2)', enabled: true, rollout: 100 },
    { id: 'gpt-4o', name: 'Use GPT-4o for Analysis', enabled: true, rollout: 50 },
    { id: 'agency-reports', name: 'Agency White-Labeling', enabled: true, rollout: 100 },
    { id: 'stripe-billing', name: 'Stripe Billing Logic', enabled: false, rollout: 0 },
];

export default function FlagsPage() {
    const [flags, setFlags] = useState(INITIAL_FLAGS);

    const toggle = (id: string) => {
        setFlags(flags.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f));
    };

    return (
        <div className="max-w-4xl">
            <h1 className="text-2xl font-bold text-white mb-6">Feature Flags</h1>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                    <thead className="bg-slate-950 text-slate-500 font-bold uppercase text-xs">
                        <tr>
                            <th className="p-4">Feature Name</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Rollout %</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {flags.map((flag) => (
                            <tr key={flag.id} className="border-t border-slate-800">
                                <td className="p-4 py-3 font-medium text-white">
                                    {flag.name}
                                    <div className="text-xs text-slate-500 font-mono mt-0.5">{flag.id}</div>
                                </td>
                                <td className="p-4 py-3">
                                    <button
                                        onClick={() => toggle(flag.id)}
                                        className={`w-10 h-5 rounded-full relative transition-colors ${flag.enabled ? 'bg-green-500' : 'bg-slate-700'}`}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${flag.enabled ? 'left-6' : 'left-1'}`} />
                                    </button>
                                </td>
                                <td className="p-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 bg-slate-800 h-2 rounded-full overflow-hidden">
                                            <div className="bg-indigo-500 h-full" style={{ width: `${flag.rollout}%` }} />
                                        </div>
                                        <span className="text-xs font-mono">{flag.rollout}%</span>
                                    </div>
                                </td>
                                <td className="p-4 py-3">
                                    <button className="text-indigo-400 hover:text-white px-2 py-1 bg-indigo-500/10 rounded text-xs">Configure</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
