'use client';

import { useState } from 'react';

export default function PlaybooksPage() {
    const [playbooks, setPlaybooks] = useState([
        { id: '1', name: 'Dental & Orthodontics', industry: 'dental', isDefault: true, description: 'Optimized for high-value patient acquisition.' },
        { id: '2', name: 'HVAC & Plumbing', industry: 'hvac', isDefault: true, description: 'Focus on emergency services and local SEO.' },
        { id: '3', name: 'Legal Services', industry: 'legal', isDefault: true, description: 'Trust-based analysis for law firms.' },
    ]);

    return (
        <div className="container max-w-6xl mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Industry Playbooks</h1>
                    <p className="text-slate-400">Customize findings, language, and pricing per vertical.</p>
                </div>
                <button
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    onClick={() => alert('Coming Soon: Custom Playbook Creator')}
                >
                    + New Custom Playbook
                </button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {playbooks.map(pb => (
                    <div key={pb.id} className="bg-slate-800 border border-slate-700 rounded-xl p-6 hover:border-slate-500 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                            <div className="bg-blue-900/50 text-blue-300 text-xs px-2 py-1 rounded uppercase tracking-wider font-semibold">
                                {pb.industry}
                            </div>
                            {pb.isDefault && (
                                <span className="text-slate-500 text-xs flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                    System Default
                                </span>
                            )}
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">{pb.name}</h3>
                        <p className="text-slate-400 text-sm mb-6 h-10">{pb.description}</p>

                        <div className="space-y-2 text-sm text-slate-500 mb-6">
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                Custom Pricing Config
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                Industry Prompts
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                Specialized Findings
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-sm transition-colors">
                                View Config
                            </button>
                            <button className="flex-1 border border-slate-600 hover:bg-slate-700 text-slate-300 py-2 rounded text-sm transition-colors">
                                Clone
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
