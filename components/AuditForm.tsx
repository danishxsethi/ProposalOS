'use client';

import { useState } from 'react';

interface AuditFormData {
    businessName: string;
    city: string;
    websiteUrl: string;
    industry: string;
}

interface AuditResult {
    success: boolean;
    auditId: string;
    status: string;
    findingsCount?: number;
    modulesCompleted?: string[];
}

export default function AuditForm({
    onAuditComplete,
}: {
    onAuditComplete: (result: AuditResult) => void;
}) {
    const [formData, setFormData] = useState<AuditFormData>({
        businessName: '',
        city: '',
        websiteUrl: '',
        industry: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.businessName,
                    city: formData.city,
                    url: formData.websiteUrl || undefined,
                    industry: formData.industry || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to start audit');
            }

            onAuditComplete(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    const industries = [
        { value: '', label: 'Select industry (optional)' },
        { value: 'restaurant', label: 'Restaurant / Food Service' },
        { value: 'dental', label: 'Dental / Healthcare' },
        { value: 'hvac', label: 'HVAC / Home Services' },
        { value: 'salon', label: 'Salon / Spa' },
        { value: 'legal', label: 'Legal Services' },
        { value: 'trades', label: 'Trades (Plumbing, Electric, etc.)' },
        { value: 'medical', label: 'Medical Practice' },
        { value: 'other', label: 'Other' },
    ];

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                <label className="label">Business Name *</label>
                <input
                    type="text"
                    className="input"
                    placeholder="Joe's Plumbing"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    required
                />
            </div>

            <div>
                <label className="label">City *</label>
                <input
                    type="text"
                    className="input"
                    placeholder="Saskatoon"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                />
            </div>

            <div>
                <label className="label">Website URL</label>
                <input
                    type="url"
                    className="input"
                    placeholder="https://joesplumbing.com"
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Optional - we'll check their Google Business Profile if no website provided
                </p>
            </div>

            <div>
                <label className="label">Industry</label>
                <select
                    className="input"
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                >
                    {industries.map((ind) => (
                        <option key={ind.value} value={ind.value}>
                            {ind.label}
                        </option>
                    ))}
                </select>
            </div>

            {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                </div>
            )}

            <button
                type="submit"
                className="btn btn-primary w-full py-4 text-base"
                disabled={isLoading}
            >
                {isLoading ? (
                    <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                                fill="none"
                            />
                            <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                        </svg>
                        Running Audit...
                    </span>
                ) : (
                    'Start Audit'
                )}
            </button>
        </form>
    );
}
