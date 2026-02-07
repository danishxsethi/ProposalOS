'use client';

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

export default function FindingCard({ finding }: { finding: Finding }) {
    const isPainkiller = finding.type === 'PAINKILLER';

    return (
        <div
            className={`finding-card ${isPainkiller ? 'finding-painkiller' : 'finding-vitamin'
                }`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <span
                            className={`badge ${isPainkiller ? 'badge-error' : 'badge-info'}`}
                        >
                            {isPainkiller ? '🔥 Urgent' : '📈 Growth'}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                            {finding.module} • {finding.category}
                        </span>
                    </div>
                    <h4 className="text-base font-medium text-[var(--color-text-primary)] mb-1">
                        {finding.title}
                    </h4>
                    <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                        <span>Impact: {finding.impactScore}/10</span>
                        <span>Confidence: {finding.confidenceScore}/10</span>
                        {finding.effortEstimate && (
                            <span>Effort: {finding.effortEstimate}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
