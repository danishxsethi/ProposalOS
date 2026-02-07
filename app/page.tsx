'use client';

import { useState } from 'react';
import AuditForm from '@/components/AuditForm';
import FindingCard from '@/components/FindingCard';
import TierCard from '@/components/TierCard';

interface Finding {
    id: string;
    module: string;
    category: string;
    type: 'PAINKILLER' | 'VITAMIN';
    title: string;
    impactScore: number;
    confidenceScore: number;
    effortEstimate?: string;
}

interface ProposalData {
    executiveSummary: string;
    tiers: {
        essentials: any;
        growth: any;
        premium: any;
    };
    painClusters: any[];
}

type AppState = 'form' | 'processing' | 'findings' | 'proposal';

export default function Home() {
    const [state, setState] = useState<AppState>('form');
    const [auditId, setAuditId] = useState<string | null>(null);
    const [businessName, setBusinessName] = useState('');
    const [findings, setFindings] = useState<Finding[]>([]);
    const [proposal, setProposal] = useState<ProposalData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleAuditComplete = async (result: any) => {
        setAuditId(result.auditId);
        setBusinessName(result.businessName || 'Business');
        setState('processing');

        // Fetch audit details with findings
        try {
            const response = await fetch(`/api/audit/${result.auditId}`);
            const data = await response.json();

            if (data.findings) {
                setFindings(data.findings);
                setBusinessName(data.businessName);
                setState('findings');
            }
        } catch (err) {
            setError('Failed to fetch audit results');
            setState('form');
        }
    };

    const handleGenerateProposal = async () => {
        if (!auditId) return;
        setState('processing');

        try {
            const response = await fetch(`/api/audit/${auditId}/propose`, {
                method: 'POST',
            });
            const data = await response.json();

            if (data.proposal) {
                setProposal(data.proposal);
                setState('proposal');
            } else {
                throw new Error(data.error || 'Failed to generate proposal');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate proposal');
            setState('findings');
        }
    };

    const resetToForm = () => {
        setState('form');
        setAuditId(null);
        setFindings([]);
        setProposal(null);
        setError(null);
    };

    return (
        <main className="min-h-screen py-12">
            <div className="container">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold mb-3">
                        <span className="gradient-text">ProposalOS</span>
                    </h1>
                    <p className="text-[var(--color-text-secondary)] text-lg">
                        Generate data-driven proposals for local businesses in minutes
                    </p>
                </div>

                {/* Form State */}
                {state === 'form' && (
                    <div className="max-w-lg mx-auto">
                        <div className="card">
                            <h2 className="text-xl font-semibold mb-6">Start a New Audit</h2>
                            <AuditForm onAuditComplete={handleAuditComplete} />
                        </div>
                    </div>
                )}

                {/* Processing State */}
                {state === 'processing' && (
                    <div className="max-w-lg mx-auto text-center">
                        <div className="card">
                            <div className="py-12">
                                <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-[var(--color-border)] border-t-[#667eea] animate-spin" />
                                <h2 className="text-xl font-semibold mb-2">Processing...</h2>
                                <p className="text-[var(--color-text-secondary)]">
                                    This typically takes 15-30 seconds
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Findings State */}
                {state === 'findings' && (
                    <div>
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-bold">{businessName}</h2>
                                <p className="text-[var(--color-text-secondary)]">
                                    {findings.length} issues identified
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button className="btn btn-secondary" onClick={resetToForm}>
                                    New Audit
                                </button>
                                <button className="btn btn-primary" onClick={handleGenerateProposal}>
                                    Generate Proposal →
                                </button>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="card text-center">
                                <div className="text-3xl font-bold text-[var(--status-error)]">
                                    {findings.filter((f) => f.type === 'PAINKILLER').length}
                                </div>
                                <div className="text-sm text-[var(--color-text-secondary)]">
                                    Urgent Issues
                                </div>
                            </div>
                            <div className="card text-center">
                                <div className="text-3xl font-bold text-[var(--status-info)]">
                                    {findings.filter((f) => f.type === 'VITAMIN').length}
                                </div>
                                <div className="text-sm text-[var(--color-text-secondary)]">
                                    Growth Opportunities
                                </div>
                            </div>
                            <div className="card text-center">
                                <div className="text-3xl font-bold text-[var(--color-text-primary)]">
                                    {Math.round(
                                        findings.reduce((sum, f) => sum + f.impactScore, 0) / findings.length
                                    )}
                                </div>
                                <div className="text-sm text-[var(--color-text-secondary)]">
                                    Avg Impact Score
                                </div>
                            </div>
                        </div>

                        {/* Findings List */}
                        <div className="space-y-4">
                            {findings
                                .sort((a, b) => b.impactScore - a.impactScore)
                                .map((finding) => (
                                    <FindingCard key={finding.id} finding={finding} />
                                ))}
                        </div>
                    </div>
                )}

                {/* Proposal State */}
                {state === 'proposal' && proposal && (
                    <div>
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-2xl font-bold">{businessName}</h2>
                                <p className="text-[var(--color-text-secondary)]">
                                    Proposal Generated
                                </p>
                            </div>
                            <button className="btn btn-secondary" onClick={resetToForm}>
                                New Audit
                            </button>
                        </div>

                        {/* Executive Summary */}
                        <div className="card mb-8">
                            <h3 className="text-lg font-semibold mb-3">Executive Summary</h3>
                            <p className="text-[var(--color-text-secondary)] leading-relaxed">
                                {proposal.executiveSummary}
                            </p>
                        </div>

                        {/* Pricing Tiers */}
                        <h3 className="text-xl font-semibold mb-6">Choose Your Package</h3>
                        <div className="grid-tiers mb-8">
                            <TierCard tier={proposal.tiers.essentials} variant="essentials" />
                            <TierCard tier={proposal.tiers.growth} variant="growth" isPopular />
                            <TierCard tier={proposal.tiers.premium} variant="premium" />
                        </div>

                        {/* CTA */}
                        <div className="card text-center">
                            <h3 className="text-lg font-semibold mb-2">Ready to get started?</h3>
                            <p className="text-[var(--color-text-secondary)] mb-4">
                                Reply to this proposal or schedule a quick call to discuss your options.
                            </p>
                            <button className="btn btn-primary">
                                Schedule a Call
                            </button>
                        </div>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="max-w-lg mx-auto mt-6">
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
