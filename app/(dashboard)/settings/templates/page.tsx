
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function TemplatesPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await fetch('/api/settings/templates');
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure? This cannot be undone.')) return;
        try {
            await fetch(`/api/settings/templates/${id}`, { method: 'DELETE' });
            fetchTemplates();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Proposal Templates</h1>
                    <p className="text-slate-400">Design your proposals to look exactly how you want.</p>
                </div>
                <Link
                    href="/settings/templates/new"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    + New Template
                </Link>
            </div>

            {isLoading ? (
                <div className="text-slate-400">Loading templates...</div>
            ) : templates.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center">
                    <h3 className="text-xl font-bold text-white mb-2">No Templates Yet</h3>
                    <p className="text-slate-400 mb-6">Create your first template to start customizing proposals.</p>
                    <Link
                        href="/settings/templates/new"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                        Create Template
                    </Link>
                </div>
            ) : (
                <div className="grid gap-6">
                    {templates.map((template) => (
                        <div key={template.id} className="bg-slate-800 border border-slate-700 rounded-xl p-6 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-lg font-bold text-white">{template.name}</h3>
                                    {template.isDefault && (
                                        <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded uppercase font-bold">Default</span>
                                    )}
                                </div>
                                <p className="text-slate-400 text-sm">{template.description || 'No description'}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <Link
                                    href={`/settings/templates/${template.id}`}
                                    className="text-slate-300 hover:text-white font-medium"
                                >
                                    Edit
                                </Link>
                                <button
                                    onClick={() => handleDelete(template.id)}
                                    className="text-slate-500 hover:text-red-400"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
