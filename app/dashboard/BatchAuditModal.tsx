'use client';

import { useState } from 'react';
import { mutate } from 'swr';

export default function BatchAuditModal({
    isOpen,
    onClose
}: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            // Parse input (each line is: Name, City, Industry (optional))
            const lines = input.trim().split('\n').filter(l => l.trim());
            const businesses = lines.map(line => {
                const parts = line.split(',').map(p => p.trim());
                return {
                    name: parts[0],
                    city: parts[1],
                    industry: parts[2] || undefined
                };
            });

            if (businesses.length === 0) {
                throw new Error('Please enter at least one business');
            }

            if (businesses.length > 10) {
                throw new Error('Maximum 10 businesses per batch');
            }

            const response = await fetch('/api/audit/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ businesses })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create batch');
            }

            // Refresh data
            mutate('/api/audits');
            mutate('/api/stats');

            // Close and notify
            onClose();
            alert(`Batch created! ${data.auditIds.length} audits queued. Batch ID: ${data.batchId}`);
            setInput('');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="card max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Batch Audit</h2>
                    <button
                        onClick={onClose}
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="label">Businesses (one per line)</label>
                        <textarea
                            className="input font-mono text-sm"
                            rows={10}
                            placeholder={`Joe's Plumbing, Saskatoon, hvac\nMain Street Dental, Saskatoon, dental\nPizza Palace, Saskatoon, restaurant`}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            required
                        />
                        <p className="text-xs text-[var(--color-text-muted)] mt-2">
                            Format: <code className="bg-[var(--color-bg-secondary)] px-1 py-0.5 rounded">Name, City, Industry</code> (max 10)
                        </p>
                    </div>

                    {error && (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn btn-secondary flex-1"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary flex-1"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Creating Batch...' : 'Create Batch'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
