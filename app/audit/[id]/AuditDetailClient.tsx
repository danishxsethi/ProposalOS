'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const statusColors = {
    COMPLETE: 'var(--status-success)',
    PARTIAL: 'var(--status-warning)',
    FAILED: 'var(--status-error)',
    QUEUED: 'var(--color-text-muted)',
    RUNNING: 'var(--status-info)'
};

export default function AuditDetailClient({ audit }: { audit: any }) {
    const router = useRouter();
    const [isGenerating, setIsGenerating] = useState(false);

    const proposal = audit.proposals[0];
    const painkillers = audit.findings.filter((f: any) => f.type === 'PAINKILLER');
    const vitamins = audit.findings.filter((f: any) => f.type === 'VITAMIN');

    const handleGenerateProposal = async () => {
        setIsGenerating(true);
        try {
            const response = await fetch(`/api/audit/${audit.id}/propose`, {
                method: 'POST'
            });
            const data = await response.json();
            if (data.success) {
                alert('Proposal generated successfully!');
                router.refresh();
            } else {
                throw new Error(data.error || 'Failed');
            }
        } catch (err) {
            alert('Error generating proposal: ' + (err instanceof Error ? err.message : 'Unknown error'));
        } finally {
            setIsGenerating(false);
        }
    };

    const copyProposalLink = () => {
        if (proposal?.webLinkToken) {
            const url = `${window.location.origin}/proposal/${proposal.webLinkToken}`;
            navigator.clipboard.writeText(url);
            alert('Proposal link copied!');
        }
    };

    const duration = audit.completedAt && audit.startedAt
        ? Math.round((new Date(audit.completedAt).getTime() - new Date(audit.startedAt).getTime()) / 1000)
        : null;

    return (
        <div className="min-h-screen py-8">
            <div className="container max-w-6xl">
                {/* Back button */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] mb-6"
                >
                    ← Back to Dashboard
                </Link>

                {/* Header */}
                <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">{audit.businessName}</h1>
                        <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                            {audit.businessCity && <span>{audit.businessCity}</span>}
                            {audit.businessIndustry && <span>• {audit.businessIndustry}</span>}
                            <span>• Created {new Date(audit.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {proposal ? (
                            <>
                                <Link
                                    href={`/proposal/${proposal.webLinkToken}`}
                                    className="btn btn-secondary"
                                    target="_blank"
                                >
                                    View Proposal
                                </Link>
                                <button
                                    onClick={copyProposalLink}
                                    className="btn btn-primary"
                                >
                                    Copy Link
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleGenerateProposal}
                                disabled={isGenerating || audit.status !== 'COMPLETE'}
                                className="btn btn-primary"
                            >
                                {isGenerating ? 'Generating...' : 'Generate Proposal'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="card">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">Status</div>
                        <span
                            className="px-2 py-1 rounded text-xs font-medium inline-block"
                            style={{
                                color: statusColors[audit.status as keyof typeof statusColors],
                                backgroundColor: `${statusColors[audit.status as keyof typeof statusColors]}20`
                            }}
                        >
                            {audit.status}
                        </span>
                    </div>
                    <div className="card">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">Findings</div>
                        <div className="text-2xl font-bold">{audit.findings.length}</div>
                    </div>
                    <div className="card">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">Cost</div>
                        <div className="text-2xl font-bold">${(audit.apiCostCents / 100).toFixed(2)}</div>
                    </div>
                    <div className="card">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">Duration</div>
                        <div className="text-2xl font-bold">{duration ? `${duration}s` : '–'}</div>
                    </div>
                </div>

                {/* Proposal Info */}
                {proposal && (
                    <div className="card mb-8 bg-[var(--gradient-success)]/5 border-[var(--status-success)]/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-semibold mb-1">Proposal Generated</div>
                                <div className="text-sm text-[var(--color-text-secondary)]">
                                    Status: {proposal.status}
                                    {proposal.viewedAt && ` • Viewed ${new Date(proposal.viewedAt).toLocaleString()}`}
                                </div>
                            </div>
                            <Link
                                href={`/proposal/${proposal.webLinkToken}`}
                                className="text-[var(--status-success)] hover:underline"
                                target="_blank"
                            >
                                View →
                            </Link>
                        </div>
                    </div>
                )}

                {/* Findings Grid */}
                <h2 className="text-xl font-semibold mb-4">Findings</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Painkillers */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 text-[var(--status-error)]">
                            🔥 Painkillers ({painkillers.length})
                        </h3>
                        <div className="space-y-3">
                            {painkillers.map((finding: any) => (
                                <FindingCard key={finding.id} finding={finding} />
                            ))}
                        </div>
                    </div>

                    {/* Vitamins */}
                    <div>
                        <h3 className="text-lg font-semibold mb-3 text-[var(--status-info)]">
                            💡 Vitamins ({vitamins.length})
                        </h3>
                        <div className="space-y-3">
                            {vitamins.map((finding: any) => (
                                <FindingCard key={finding.id} finding={finding} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function FindingCard({ finding }: { finding: any }) {
    return (
        <div className="card hover:bg-[var(--color-bg-card-hover)] transition-colors">
            <div className="flex items-start justify-between mb-2">
                <h4 className="font-medium text-sm">{finding.title}</h4>
                <div className="flex gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-[var(--status-warning)]/20 text-[var(--status-warning)]">
                        Impact: {finding.impactScore}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[var(--status-info)]/20 text-[var(--status-info)]">
                        Conf: {finding.confidenceScore}
                    </span>
                </div>
            </div>
            {finding.description && (
                <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
                    {finding.description}
                </p>
            )}
            <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                {finding.category} • {finding.module}
            </div>
        </div>
    );
}
