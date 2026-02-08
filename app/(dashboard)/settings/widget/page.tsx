'use client';

import { useState, useEffect } from 'react';

export default function WidgetSettingsPage() {
    const [tenantId, setTenantId] = useState<string>(''); // Ideally fetch from context
    const [color, setColor] = useState('#6366f1');
    const [copied, setCopied] = useState(false);

    // Mock fetching tenant ID
    useEffect(() => {
        // In real app, we get this from Authenticated Session
        // For now, let's pretend/fetch generic
        fetch('/api/auth/session').then(res => res.json()).then(data => {
            if (data?.user?.tenantId) setTenantId(data.user.tenantId);
            else setTenantId('YOUR_TENANT_ID');
        }).catch(() => setTenantId('YOUR_TENANT_ID'));
    }, []);

    const embedCode = `<script src="https://proposalengine.com/widget.js" \n  data-tenant="${tenantId}" \n  data-color="${color}"></script>`;

    const copyToClipboard = () => {
        navigator.clipboard.writeText(embedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100 mb-2">Lead Gen Widget</h1>
                    <p className="text-slate-400">Embed this widget on your agency website to capture leads automatically.</p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Configuration */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-6">Configuration</h2>

                    <div className="mb-6">
                        <label className="block text-slate-400 mb-2 text-sm font-medium">Brand Color</label>
                        <div className="flex items-center gap-4">
                            <input
                                type="color"
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                className="bg-transparent border-0 w-10 h-10 cursor-pointer"
                            />
                            <input
                                type="text"
                                value={color}
                                onChange={e => setColor(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-2 w-32 font-mono"
                            />
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-slate-400 mb-2 text-sm font-medium">Embed Code</label>
                        <div className="relative">
                            <pre className="bg-slate-950 p-4 rounded-lg text-slate-300 font-mono text-sm overflow-x-auto border border-slate-700 whitespace-pre-wrap">
                                {embedCode}
                            </pre>
                            <button
                                onClick={copyToClipboard}
                                className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700 text-xs text-white px-3 py-1 rounded transition border border-slate-600"
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                        <h4 className="flex items-center gap-2 text-indigo-400 font-bold text-sm mb-2">
                            <span>💡 Pro Tip</span>
                        </h4>
                        <p className="text-xs text-slate-300">
                            Place this code before the closing <code className="bg-indigo-900/50 px-1 rounded">&lt;/body&gt;</code> tag on your website.
                            It works with WordPress, Webflow, Squarespace, and custom sites.
                        </p>
                    </div>
                </div>

                {/* Preview */}
                <div className="relative bg-white border border-slate-200 rounded-xl overflow-hidden h-[500px]">
                    <div className="absolute top-0 left-0 right-0 h-8 bg-slate-100 border-b flex items-center px-4 gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-400"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <div className="w-3 h-3 rounded-full bg-green-400"></div>
                        <div className="ml-4 text-xs text-slate-400 bg-white px-2 py-0.5 rounded border">youragency.com</div>
                    </div>

                    <div className="p-8 mt-8">
                        <h2 className="text-3xl font-bold text-slate-900 mb-4">We Build Great Digital Experiences</h2>
                        <p className="text-slate-600">Your agency landing page content goes here...</p>
                    </div>

                    {/* Mock Widget */}
                    <div
                        className="absolute bottom-5 right-5 w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shadow-lg cursor-default"
                        style={{ backgroundColor: color }}
                    >
                        ⚡️
                    </div>

                    <div className="absolute bottom-5 right-5 w-14 h-14 rounded-full border-2 border-white animate-ping opacity-20 pointer-events-none" style={{ backgroundColor: color }}></div>
                </div>
            </div>
        </div>
    );
}
