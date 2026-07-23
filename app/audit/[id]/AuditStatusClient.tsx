'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AuditStatusClientProps {
    audit: any;
}

export default function AuditStatusClient({ audit: initialAudit }: AuditStatusClientProps) {
    const router = useRouter();
    const [audit, setAudit] = useState(initialAudit);
    const [polling, setPolling] = useState(
        initialAudit.status === 'QUEUED' || initialAudit.status === 'RUNNING'
    );

    useEffect(() => {
        if (!polling) return;

        const interval = setInterval(async () => {
            const response = await fetch(`/api/audit/${audit.id}`);
            const data = await response.json();
            setAudit(data);

            if (data.status !== 'QUEUED' && data.status !== 'RUNNING') {
                setPolling(false);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [polling, audit.id]);

    const statusColors = {
        QUEUED: 'text-yellow-400',
        RUNNING: 'text-blue-400',
        COMPLETE: 'text-green-400',
        PARTIAL: 'text-orange-400',
        FAILED: 'text-red-400',
    };

    const proposal = audit.proposals?.[0];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        {audit.businessName}
                    </h1>
                    {audit.businessCity && (
                        <p className="text-gray-400">{audit.businessCity}</p>
                    )}
                </div>

                {/* Status Card */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-white">Audit Status</h2>
                        <span className={`text-lg font-bold ${statusColors[audit.status as keyof typeof statusColors]}`}>
                            {audit.status}
                        </span>
                    </div>

                    {polling && (
                        <div className="flex items-center gap-3 text-gray-400 mb-4">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <span>Running audit modules...</span>
                        </div>
                    )}

                    {/* Modules Status */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        {['website', 'gbp', 'competitor'].map((module) => {
                            const completed = audit.modulesCompleted?.includes(module);
                            const failed = audit.modulesFailed?.some((f: any) => f.module === module);

                            return (
                                <div
                                    key={module}
                                    className={`p-3 rounded-lg border ${completed
                                        ? 'bg-green-900/30 border-green-700'
                                        : failed
                                            ? 'bg-red-900/30 border-red-700'
                                            : 'bg-gray-700 border-gray-600'
                                        }`}
                                >
                                    <div className="text-xs text-gray-400 uppercase">{module}</div>
                                    <div className={`font-semibold ${completed ? 'text-green-400' : failed ? 'text-red-400' : 'text-gray-500'
                                        }`}>
                                        {completed ? '✓ Done' : failed ? '✗ Failed' : '...'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Cost */}
                    {audit.apiCostCents !== null && audit.apiCostCents !== undefined && (
                        <div className="text-sm text-gray-400">
                            API Cost: ${(audit.apiCostCents / 100).toFixed(2)}
                        </div>
                    )}
                </div>

                {/* Findings */}
                {audit.findings && audit.findings.length > 0 && (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
                        <h2 className="text-xl font-semibold text-white mb-4">
                            Findings ({audit.findings.length})
                        </h2>
                        <div className="space-y-3">
                            {audit.findings.map((finding: any) => (
                                <div key={finding.id} className="p-4 bg-gray-900 rounded-lg border border-gray-700">
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="font-semibold text-white">{finding.title}</h3>
                                        <span className={`text-xs px-2 py-1 rounded ${finding.type === 'painkiller'
                                            ? 'bg-red-900/50 text-red-300'
                                            : 'bg-green-900/50 text-green-300'
                                            }`}>
                                            {finding.type === 'painkiller' ? 'Urgent' : 'Growth'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400">{finding.description}</p>
                                    <div className="mt-2 text-xs text-gray-500">
                                        Impact: {finding.impactScore}/10 • Module: {finding.module}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Proposal Link */}
                {proposal && (
                    <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-blue-700 rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-white mb-2">
                            ✨ Proposal Ready
                        </h2>
                        <p className="text-gray-300 mb-4">
                            Your professional proposal has been generated and is ready to view.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                            <Link
                                href={`/proposal/${proposal.webLinkToken}`}
                                className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
                            >
                                View Proposal →
                            </Link>

                            <EmailSender token={proposal.webLinkToken} />
                        </div>
                    </div>
                )}

                {/* Back Button */}
                <div className="mt-8">
                    <Link
                        href="/new-audit"
                        className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                        ← Create Another Audit
                    </Link>
                </div>
            </div>
        </div>
    );
}

function EmailSender({ token }: { token: string }) {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;

        setStatus('sending');
        try {
            const res = await fetch(`/api/proposal/${token}/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to send');

            setStatus('sent');
            setMessage('Email sent successfully!');
            setTimeout(() => setStatus('idle'), 3000);
            setEmail('');
        } catch (err) {
            setStatus('error');
            setMessage(err instanceof Error ? err.message : 'Failed to send');
        }
    };

    if (status === 'sent') {
        return <span className="text-green-400 font-medium py-3">✓ {message}</span>;
    }

    return (
        <form onSubmit={handleSend} className="flex gap-2 w-full sm:w-auto">
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email to share..."
                className="bg-gray-800 border border-gray-600 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 w-full sm:w-64"
                disabled={status === 'sending'}
                required
            />
            <button
                type="submit"
                disabled={status === 'sending'}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
                {status === 'sending' ? 'Sending...' : 'Send'}
            </button>
            {status === 'error' && (
                <span className="text-red-400 text-sm absolute mt-12">{message}</span>
            )}
        </form>
    );
}
