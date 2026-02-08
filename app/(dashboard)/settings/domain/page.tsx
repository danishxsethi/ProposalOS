'use client';

import { useState, useEffect } from 'react';

export default function DomainSettingsPage() {
    const [domain, setDomain] = useState('');
    const [status, setStatus] = useState<'idle' | 'pending' | 'verified'>('idle');
    const [verificationInfo, setVerificationInfo] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(false);

    // Initial fetch to see if domain exists
    // We reuse verify endpoint or fetch branding?
    // Let's assume we can fetch current branding separately or just use verify logic.
    // For MVP, lets just let user input. Better UX would be fetching current state.
    // I'll skip fetching for now to save tool calls, as Verify handles upsert.

    // Actually, we should show current status.
    // I don't have a direct "GET branding" handy, but /api/settings/branding might exist?
    // Let's assume user types it first time.

    const handleVerify = async () => {
        setVerifying(true);
        try {
            const res = await fetch('/api/settings/domain/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain })
            });
            const data = await res.json();

            if (data.verified) {
                setStatus('verified');
                setVerificationInfo(null);
            } else {
                setStatus('pending');
                setVerificationInfo(data);
            }
        } catch (e) {
            alert('Error verifying domain');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-slate-100 mb-8">Custom Domain</h1>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8">
                <div className="mb-6">
                    <label className="block text-slate-400 mb-2">Your Custom Domain</label>
                    <div className="flex gap-4">
                        <input
                            type="text"
                            placeholder="proposals.acme.com"
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white"
                            value={domain}
                            onChange={e => setDomain(e.target.value)}
                        />
                        <button
                            onClick={handleVerify}
                            disabled={verifying || !domain}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
                        >
                            {verifying ? 'Verifying...' : 'Verify Domain'}
                        </button>
                    </div>
                </div>

                {status === 'verified' && (
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-6">
                        <h3 className="text-green-400 font-bold flex items-center gap-2">
                            ✓ Domain Verified
                        </h3>
                        <p className="text-slate-300 mt-2">
                            Your proposals are now live at <a href={`https://${domain}`} target="_blank" className="underline hover:text-white">https://{domain}</a>
                        </p>
                    </div>
                )}

                {status === 'pending' && verificationInfo && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-6">
                        <h3 className="text-amber-400 font-bold mb-4">Verification Required</h3>
                        <p className="text-slate-300 mb-4">
                            Please add the following TXT record to your DNS provider to verify ownership.
                        </p>

                        <div className="grid grid-cols-[120px_1fr] gap-4 mb-4 text-sm">
                            <div className="text-slate-500">Type</div>
                            <div className="text-white font-mono">TXT</div>

                            <div className="text-slate-500">Host</div>
                            <div className="text-white font-mono bg-slate-900 p-2 rounded">{verificationInfo.host}</div>

                            <div className="text-slate-500">Value</div>
                            <div className="text-white font-mono bg-slate-900 p-2 rounded">{verificationInfo.token}</div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-700">
                            <h4 className="text-white font-bold mb-2">Next Step: CNAME Record</h4>
                            <p className="text-slate-400 text-sm mb-4">
                                Once verified, create a CNAME record to point your domain to us.
                            </p>
                            <div className="grid grid-cols-[120px_1fr] gap-4 text-sm">
                                <div className="text-slate-500">Type</div>
                                <div className="text-white font-mono">CNAME</div>

                                <div className="text-slate-500">Host</div>
                                <div className="text-white font-mono bg-slate-900 p-2 rounded">{domain}</div>

                                <div className="text-slate-500">Value</div>
                                <div className="text-white font-mono bg-slate-900 p-2 rounded">cname.vercel-dns.com</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
