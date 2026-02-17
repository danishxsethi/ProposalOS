'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { formatCost } from '@/lib/config/costBudget';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const statusColors = {
    COMPLETE: 'var(--status-success)',
    PARTIAL: 'var(--status-warning)',
    FAILED: 'var(--status-error)',
    QUEUED: 'var(--color-text-muted)',
    RUNNING: 'var(--status-info)'
};

export default function AuditTable() {
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [resending, setResending] = useState<string | null>(null);

    // Build query string
    const query = new URLSearchParams();
    query.set('page', page.toString());
    if (status) query.set('status', status);
    if (search) query.set('search', search);

    const { data, error, isLoading } = useSWR(
        `/api/audits?${query.toString()}`,
        fetcher,
        { refreshInterval: 30000 }
    );

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearch(searchInput);
        setPage(1);
    };

    const copyProposalLink = (token: string) => {
        const url = `${window.location.origin}/proposal/${token}`;
        navigator.clipboard.writeText(url);
        alert('Proposal link copied!');
    };

    const resendProposal = async (proposalId: string) => {
        if (resending) return;

        setResending(proposalId);
        try {
            const res = await fetch(`/api/proposal/id/${proposalId}/resend`, {
                method: 'POST',
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Failed to resend');
            }

            alert('Proposal email resent successfully!');
        } catch (error) {
            alert(`Failed to resend: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setResending(null);
        }
    };

    return (
        <div className="card">
            {/* Filters */}
            <div className="flex gap-4 mb-6 flex-wrap">
                <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
                    <input
                        type="text"
                        placeholder="Search by business name..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        className="w-full px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-hover)]"
                    />
                </form>
                <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                    className="px-4 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-hover)]"
                >
                    <option value="">All Statuses</option>
                    <option value="COMPLETE">Complete</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="FAILED">Failed</option>
                    <option value="QUEUED">Queued</option>
                    <option value="RUNNING">Running</option>
                </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="border-b border-[var(--color-border)]">
                        <tr className="text-left text-sm text-[var(--color-text-secondary)]">
                            <th className="pb-3 font-medium">Business</th>
                            <th className="pb-3 font-medium">Status</th>
                            <th className="pb-3 font-medium">Findings</th>
                            <th className="pb-3 font-medium">Cost</th>
                            <th className="pb-3 font-medium">Client Score</th>
                            <th className="pb-3 font-medium">Created</th>
                            <th className="pb-3 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            // Loading skeleton
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="border-b border-[var(--color-border)]">
                                    <td className="py-4">
                                        <div className="h-4 w-32 bg-[var(--color-bg-card)] animate-pulse rounded" />
                                    </td>
                                    <td className="py-4">
                                        <div className="h-6 w-20 bg-[var(--color-bg-card)] animate-pulse rounded" />
                                    </td>
                                    <td className="py-4">
                                        <div className="h-4 w-8 bg-[var(--color-bg-card)] animate-pulse rounded" />
                                    </td>
                                    <td className="py-4">
                                        <div className="h-4 w-24 bg-[var(--color-bg-card)] animate-pulse rounded" />
                                    </td>
                                    <td className="py-4">
                                        <div className="h-8 w-32 bg-[var(--color-bg-card)] animate-pulse rounded" />
                                    </td>
                                </tr>
                            ))
                        ) : error ? (
                            <tr>
                                <td colSpan={7} className="py-8 text-center text-red-400">
                                    Failed to load audits
                                </td>
                            </tr>
                        ) : data?.audits?.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-8 text-center text-[var(--color-text-secondary)]">
                                    No audits found
                                </td>
                            </tr>
                        ) : (
                            data?.audits?.map((audit: any) => (
                                <tr key={audit.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-card-hover)]">
                                    <td className="py-4">
                                        <div className="font-medium">{audit.businessName}</div>
                                        <div className="text-sm text-[var(--color-text-muted)]">
                                            {audit.businessCity && `${audit.businessCity} • `}
                                            {audit.businessIndustry || 'General'}
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <span
                                            className="px-2 py-1 rounded text-xs font-medium"
                                            style={{
                                                color: statusColors[audit.status as keyof typeof statusColors],
                                                backgroundColor: `${statusColors[audit.status as keyof typeof statusColors]}20`
                                            }}
                                        >
                                            {audit.status}
                                        </span>
                                    </td>
                                    <td className="py-4 text-sm">{audit.findingsCount}</td>
                                    <td className="py-4 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span>{formatCost(audit.cost)}</span>
                                            {audit.costStatus?.message && (
                                                <span
                                                    className="text-xs px-1.5 py-0.5 rounded"
                                                    style={{
                                                        color: audit.costStatus.color,
                                                        backgroundColor: `${audit.costStatus.color}20`
                                                    }}
                                                    title={audit.costStatus.message}
                                                >
                                                    {audit.costStatus.level === 'critical' ? '⚠️' : '⚡'}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 text-sm">
                                        {(audit.clientScore ?? audit.qaScore) !== undefined && (audit.clientScore ?? audit.qaScore) !== null ? (
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${(audit.clientScore ?? audit.qaScore) >= 80 ? 'bg-green-500/20 text-green-400' :
                                                (audit.clientScore ?? audit.qaScore) >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-red-500/20 text-red-400'
                                                }`}>
                                                {audit.clientScore ?? audit.qaScore}%
                                            </span>
                                        ) : (
                                            <span className="text-[var(--color-text-muted)]">-</span>
                                        )}
                                        {audit.requiresHumanReview && (
                                            <div className="text-[11px] text-amber-300 mt-1">Needs human closeability review</div>
                                        )}
                                    </td>
                                    <td className="py-4 text-sm text-[var(--color-text-secondary)]">
                                        {new Date(audit.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="py-4">
                                        <div className="flex gap-2 text-sm">
                                            <Link
                                                href={`/audit/${audit.id}`}
                                                className="text-[var(--tier-essentials)] hover:underline"
                                            >
                                                View
                                            </Link>
                                            {audit.proposal && (
                                                <>
                                                    <span className="text-[var(--color-border)]">•</span>
                                                    <Link
                                                        href={`/preview/${audit.proposal.webLinkToken}`}
                                                        className="text-blue-400 hover:underline"
                                                    >
                                                        Preview
                                                    </Link>
                                                    <span className="text-[var(--color-border)]">•</span>
                                                    <button
                                                        onClick={() => copyProposalLink(audit.proposal.webLinkToken)}
                                                        className="text-[var(--tier-growth)] hover:underline"
                                                    >
                                                        Copy Link
                                                    </button>
                                                    {audit.proposal.sentAt && !audit.proposal.viewedAt && (
                                                        <>
                                                            <span className="text-[var(--color-border)]">•</span>
                                                            <button
                                                                onClick={() => resendProposal(audit.proposal.id)}
                                                                disabled={resending === audit.proposal.id}
                                                                className="text-[var(--status-warning)] hover:underline disabled:opacity-50"
                                                            >
                                                                {resending === audit.proposal.id ? 'Sending...' : 'Resend'}
                                                            </button>
                                                        </>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {data?.pagination && (
                <div className="mt-6 flex items-center justify-between text-sm">
                    <div className="text-[var(--color-text-secondary)]">
                        Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 border border-[var(--color-border)] rounded disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= data.pagination.totalPages}
                            className="px-3 py-1 border border-[var(--color-border)] rounded disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
