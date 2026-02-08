
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function TemplateEditorPage() {
    const params = useParams();
    const router = useRouter();
    const isNew = params.id === 'new';

    const [isLoading, setIsLoading] = useState(!isNew);
    const [isSaving, setIsSaving] = useState(false);

    const [form, setForm] = useState({
        name: 'New Template',
        description: '',
        isDefault: false,
        introText: 'We are excited to present our findings regarding your digital presence. This audit covers comprehensive performance, SEO, and user experience analysis.',
        outroText: 'Ready to take the next step? We can help you implement these fixes and grow your business today.',
        ctaText: 'Schedule Strategy Call',
        ctaUrl: 'https://calendly.com/',
        showFindings: true,
        showCompetitorMatrix: true,
        showRoi: true,
        customCss: '',
        headerHtml: ''
    });

    useEffect(() => {
        if (!isNew && params.id) {
            fetchTemplate();
        }
    }, [params.id]);

    const fetchTemplate = async () => {
        try {
            const res = await fetch(`/api/settings/templates/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setForm(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const url = isNew ? '/api/settings/templates' : `/api/settings/templates/${params.id}`;
            const method = isNew ? 'POST' : 'PATCH';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });

            if (res.ok) {
                router.push('/settings/templates');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to save template');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-slate-400">Loading editor...</div>;

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">{isNew ? 'Create Template' : 'Edit Template'}</h1>
                    <p className="text-slate-400">Customize how your proposals appear to prospects.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 border border-transparent hover:border-slate-700 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold transition-all disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : 'Save Template'}
                    </button>
                </div>
            </header>

            <form id="template-form" onSubmit={handleSave} className="space-y-8">
                {/* Basic Info */}
                <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Basic Information</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Template Name</label>
                            <input
                                required
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Short Description</label>
                            <input
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                value={form.description || ''}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-3 mt-4">
                            <input
                                type="checkbox"
                                id="isDefault"
                                className="w-5 h-5 rounded bg-slate-900 border-slate-700"
                                checked={form.isDefault}
                                onChange={e => setForm({ ...form, isDefault: e.target.checked })}
                            />
                            <label htmlFor="isDefault" className="text-white font-medium">Set as Default Template</label>
                        </div>
                    </div>
                </section>

                {/* Visibility Toggles */}
                <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Section Visibility</h3>
                    <div className="flex gap-8">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={form.showFindings}
                                onChange={e => setForm({ ...form, showFindings: e.target.checked })}
                            />
                            <span className="text-slate-300">Show Detailed Findings</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={form.showCompetitorMatrix}
                                onChange={e => setForm({ ...form, showCompetitorMatrix: e.target.checked })}
                            />
                            <span className="text-slate-300">Show Competitor Matrix</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4"
                                checked={form.showRoi}
                                onChange={e => setForm({ ...form, showRoi: e.target.checked })}
                            />
                            <span className="text-slate-300">Show ROI Calculator</span>
                        </label>
                    </div>
                </section>

                {/* Content Customization */}
                <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Content Customization</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Intro Text (Before Executive Summary)</label>
                            <textarea
                                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white h-24 focus:outline-none focus:border-indigo-500"
                                value={form.introText || ''}
                                onChange={e => setForm({ ...form, introText: e.target.value })}
                            />
                            <p className="text-xs text-slate-500 mt-1">Variables supported: {'{businessName}'}, {'{city}'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Outro Text (Footer/Closing)</label>
                            <textarea
                                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white h-24 focus:outline-none focus:border-indigo-500"
                                value={form.outroText || ''}
                                onChange={e => setForm({ ...form, outroText: e.target.value })}
                            />
                        </div>
                    </div>
                </section>

                {/* CTA Settings */}
                <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Call to Action</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Button Text</label>
                            <input
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                placeholder="Schedule Call"
                                value={form.ctaText || ''}
                                onChange={e => setForm({ ...form, ctaText: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Button URL</label>
                            <input
                                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                placeholder="https://calendly.com/your-link"
                                value={form.ctaUrl || ''}
                                onChange={e => setForm({ ...form, ctaUrl: e.target.value })}
                            />
                        </div>
                    </div>
                </section>

                {/* Advanced */}
                <section className="bg-slate-800 border border-slate-700 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4">Advanced</h3>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Custom CSS</label>
                        <textarea
                            className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-amber-500 font-mono text-sm h-32 focus:outline-none focus:border-indigo-500"
                            placeholder=".proposal-header { background: #000; }"
                            value={form.customCss || ''}
                            onChange={e => setForm({ ...form, customCss: e.target.value })}
                        />
                    </div>
                </section>

            </form>
        </div>
    );
}
