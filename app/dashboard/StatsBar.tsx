'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function StatsBar() {
    const { data, error, isLoading } = useSWR('/api/stats', fetcher, {
        refreshInterval: 30000 // Refresh every 30 seconds
    });

    if (error) return <div className="text-red-400 text-sm">Failed to load stats</div>;

    const stats = [
        {
            label: 'Audits This Month',
            value: data?.auditsThisMonth ?? '–',
            gradient: 'var(--gradient-primary)'
        },
        {
            label: 'Proposals Sent',
            value: data?.proposalsSent ?? '–',
            gradient: 'var(--gradient-info)'
        },
        {
            label: 'Proposals Viewed',
            value: data?.proposalsViewed ?? '–',
            subValue: data?.conversionRate ? `${data.conversionRate}% conversion` : '',
            gradient: 'var(--gradient-success)'
        },
        {
            label: 'Avg Cost',
            value: data?.avgCostCents != null ? `$${(data.avgCostCents / 100).toFixed(2)}` : '–',
            gradient: 'var(--gradient-warning)'
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, idx) => (
                <div key={idx} className="card relative overflow-hidden">
                    <div
                        className="absolute inset-0 opacity-5"
                        style={{ background: stat.gradient }}
                    />
                    <div className="relative">
                        <div className="text-sm text-[var(--color-text-secondary)] mb-1">
                            {stat.label}
                        </div>
                        <div className="text-3xl font-bold mb-1">
                            {isLoading ? (
                                <div className="h-9 w-16 bg-[var(--color-bg-card)] animate-pulse rounded" />
                            ) : (
                                stat.value
                            )}
                        </div>
                        {stat.subValue && (
                            <div className="text-xs text-[var(--color-text-muted)]">
                                {stat.subValue}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
