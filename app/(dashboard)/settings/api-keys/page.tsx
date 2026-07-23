'use client';

import { useState, useEffect } from 'react';

interface ApiKey {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    createdAt: string;
    lastUsedAt?: string;
}

export default function ApiKeysPage() {
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);

    const fetchKeys = async () => {
        try {
            const res = await fetch('/api/settings/api-keys');
            const data = await res.json();
            if (data.keys) {
                setKeys(data.keys);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    const handleRevoke = async (id: string) => {
        if (!confirm('Are you sure you want to revoke this key? This action cannot be undone.')) return;

        try {
            const res = await fetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchKeys();
            } else {
                alert('Failed to revoke key');
            }
        } catch (error) {
            alert('Error revoking key');
        }
    };

    return (
        <div className="container max-w-5xl mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">API Keys</h1>
                    <p className="text-slate-400">Manage programmatic access to your data.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    + Create New Key
                </button>
            </div>

            {/* Keys List */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900/50 text-slate-400 text-sm">
                        <tr>
                            <th className="px-6 py-4 font-medium">Name</th>
                            <th className="px-6 py-4 font-medium">Key Prefix</th>
                            <th className="px-6 py-4 font-medium">Created</th>
                            <th className="px-6 py-4 font-medium">Last Used</th>
                            <th className="px-6 py-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {loading && (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Loading keys...</td></tr>
                        )}
                        {!loading && keys.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No active API keys found.</td></tr>
                        )}
                        {keys.map((key) => (
                            <tr key={key.id} className="hover:bg-slate-700/30 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="text-white font-medium">{key.name}</div>
                                    <div className="text-slate-500 text-xs mt-1 flex gap-2">
                                        {key.scopes.map(s => <span key={s} className="bg-slate-800 px-1 rounded">{s}</span>)}
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono text-slate-300 text-sm">{key.keyPrefix}****</td>
                                <td className="px-6 py-4 text-slate-400 text-sm">{new Date(key.createdAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-slate-400 text-sm">
                                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => handleRevoke(key.id)}
                                        className="text-red-400 hover:text-red-300 text-sm hover:underline"
                                    >
                                        Revoke
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Modal */}
            {showCreateModal && <CreateKeyModal onClose={() => setShowCreateModal(false)} onCreated={(k) => {
                setNewKey(k);
                setShowCreateModal(false);
                fetchKeys();
            }} />}

            {/* Success Modal */}
            {newKey && <SuccessModal secretKey={newKey} onClose={() => setNewKey(null)} />}
        </div>
    );
}

function CreateKeyModal({ onClose, onCreated }: { onClose: () => void, onCreated: (key: string) => void }) {
    const [name, setName] = useState('');
    const [scopes, setScopes] = useState({
        'audit:read': true,
        'audit:create': true,
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const selectedScopes = Object.entries(scopes).filter(([_, v]) => v).map(([k]) => k);

        try {
            const res = await fetch('/api/settings/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, scopes: selectedScopes }),
            });
            const data = await res.json();
            if (data.key) {
                onCreated(data.key);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
                <h3 className="text-xl font-bold text-white mb-4">Create API Key</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Key Name</label>
                        <input
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. CI/CD Pipeline"
                            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Permissions</label>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={scopes['audit:read']} onChange={e => setScopes(p => ({ ...p, 'audit:read': e.target.checked }))} />
                                Read Audits
                            </label>
                            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                                <input type="checkbox" checked={scopes['audit:create']} onChange={e => setScopes(p => ({ ...p, 'audit:create': e.target.checked }))} />
                                Create Audits
                            </label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">Cancel</button>
                        <button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded">
                            {loading ? 'Creating...' : 'Create Key'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SuccessModal({ secretKey, onClose }: { secretKey: string, onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
            <div className="bg-slate-800 rounded-xl border border-green-500/50 p-6 w-full max-w-lg shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-green-900/50 flex items-center justify-center text-green-400">✓</div>
                    <h3 className="text-xl font-bold text-white">API Key Created</h3>
                </div>

                <p className="text-slate-300 mb-4 text-sm">
                    Copy this key now. You won't be able to see it again!
                </p>

                <div className="bg-slate-950 border border-slate-700 rounded p-4 flex items-center justify-between mb-6 group relative">
                    <code className="text-green-400 font-mono text-sm break-all">{secretKey}</code>
                    <button
                        onClick={() => navigator.clipboard.writeText(secretKey)}
                        className="ml-4 text-slate-400 hover:text-white bg-slate-800 px-2 py-1 rounded text-xs"
                    >
                        Copy
                    </button>
                </div>

                <div className="flex justify-end">
                    <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded">
                        I've copied it
                    </button>
                </div>
            </div>
        </div>
    );
}
