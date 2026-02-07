'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewAuditPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [inputType, setInputType] = useState<'name' | 'url'>('name');

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        const city = formData.get('city') as string;
        const url = formData.get('url') as string;

        try {
            const body = inputType === 'name'
                ? { name, city }
                : { url };

            const response = await fetch('/api/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create audit');
            }

            // Redirect to audit status page
            router.push(`/audit/${data.auditId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-8">
                <h1 className="text-3xl font-bold text-white mb-2">Create New Audit</h1>
                <p className="text-gray-400 mb-6">
                    Generate a professional audit and proposal in under 90 seconds
                </p>

                {/* Input Type Selector */}
                <div className="flex gap-2 mb-6 bg-gray-900 p-1 rounded-lg">
                    <button
                        type="button"
                        onClick={() => setInputType('name')}
                        className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${inputType === 'name'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Business Name
                    </button>
                    <button
                        type="button"
                        onClick={() => setInputType('url')}
                        className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${inputType === 'url'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white'
                            }`}
                    >
                        Website URL
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    {inputType === 'name' ? (
                        <>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Business Name *
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    placeholder="Joe's Plumbing"
                                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    City *
                                </label>
                                <input
                                    type="text"
                                    name="city"
                                    required
                                    placeholder="Saskatoon"
                                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </>
                    ) : (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Website URL *
                            </label>
                            <input
                                type="url"
                                name="url"
                                required
                                placeholder="https://example.com"
                                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                        {loading ? 'Creating Audit...' : 'Create Audit'}
                    </button>
                </form>

                <p className="mt-6 text-xs text-gray-500 text-center">
                    The audit will analyze website performance, Google Business Profile, and competitor comparison
                </p>
            </div>
        </div>
    );
}
