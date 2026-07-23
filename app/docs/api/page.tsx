'use client';

import { useState } from 'react';

export default function ApiDocsPage() {
    const [apiKey, setApiKey] = useState('');
    const [activeTab, setActiveTab] = useState('audit');

    const endpoints = [
        {
            id: 'create-audit',
            method: 'POST',
            path: '/api/v1/audit',
            description: 'Create a new audit for a business.',
            body: {
                businessName: 'Acme Corp',
                businessUrl: 'acme.com',
                city: 'New York',
                industry: 'Retail'
            }
        },
        {
            id: 'get-audit',
            method: 'GET',
            path: '/api/v1/audit/{id}',
            description: 'Retrieve audit status and findings.',
        }
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
            <div className="max-w-6xl mx-auto grid grid-cols-12 gap-8">
                {/* Sidebar */}
                <div className="col-span-3">
                    <h1 className="text-2xl font-bold text-indigo-400 mb-6">ProposalOS API</h1>
                    <div className="space-y-2">
                        <button className="block w-full text-left px-4 py-2 rounded bg-slate-900 text-white">Reference</button>
                        <button className="block w-full text-left px-4 py-2 rounded hover:bg-slate-900 text-slate-400">Authentication</button>
                        <button className="block w-full text-left px-4 py-2 rounded hover:bg-slate-900 text-slate-400">Rate Limits</button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="col-span-9 space-y-12">

                    <section>
                        <h2 className="text-3xl font-bold text-white mb-4">Authentication</h2>
                        <p className="text-slate-400 mb-4">
                            Authenticate requests by passing your API Key in the <code className="text-indigo-300">Authorization</code> header.
                        </p>
                        <div className="bg-slate-900 p-4 rounded-lg font-mono text-sm">
                            Authorization: Bearer pe_live_xxxx...
                        </div>
                    </section>

                    <section>
                        <h2 className="text-3xl font-bold text-white mb-6">Endpoints</h2>

                        {endpoints.map(ep => (
                            <div key={ep.id} className="mb-12 border border-slate-800 rounded-xl overflow-hidden">
                                <div className="bg-slate-900/50 p-6 border-b border-slate-800 flex items-center gap-4">
                                    <span className={`px-3 py-1 rounded text-sm font-bold ${ep.method === 'POST' ? 'bg-green-500/20 text-green-400' :
                                            ep.method === 'GET' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700'
                                        }`}>
                                        {ep.method}
                                    </span>
                                    <code className="text-lg text-white font-mono">{ep.path}</code>
                                </div>
                                <div className="p-6">
                                    <p className="text-slate-400 mb-6">{ep.description}</p>

                                    {ep.body && (
                                        <div className="mb-6">
                                            <h4 className="text-sm font-bold text-slate-300 mb-2">Request Body</h4>
                                            <pre className="bg-slate-950 p-4 rounded text-sm text-indigo-300 overflow-x-auto">
                                                {JSON.stringify(ep.body, null, 2)}
                                            </pre>
                                        </div>
                                    )}

                                    <div className="bg-slate-950 rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-slate-500 uppercase">Curl Example</span>
                                        </div>
                                        <code className="text-xs text-slate-400 font-mono break-all block">
                                            curl -X {ep.method} https://api.proposalos.com{ep.path} \<br />
                                            &nbsp;&nbsp;-H "Authorization: Bearer $API_KEY"
                                            {ep.body ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(ep.body)}'` : ''}
                                        </code>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </section>
                </div>
            </div>
        </div>
    );
}
