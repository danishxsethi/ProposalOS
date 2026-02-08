'use client';

import { useState, useRef, useEffect } from 'react';

// Should fetch from API, but for MVP UI demo we can mock logic 
// or implement a server action to save. 
// Assuming we have GET/POST /api/settings/branding (or just update tenant)
// For now, I'll simulate the state management.

export default function BrandingPage() {
    const [config, setConfig] = useState({
        brandName: '',
        tagline: '',
        primaryColor: '#8B5CF6',
        secondaryColor: '#38BDF8',
        accentColor: '#F59E0B',
        logoUrl: '',
        contactEmail: '',
        showPoweredBy: true,
    });
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initial Fetch (Mock)
    useEffect(() => {
        // fetch('/api/settings/branding').then(...)
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) {
                setConfig(prev => ({ ...prev, logoUrl: data.url }));
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (err) {
            alert('Upload error');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // await fetch('/api/settings/branding', { body: JSON.stringify(config) ... })
            // For now, simulate success
            await new Promise(r => setTimeout(r, 1000));
            alert('Branding saved!');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="container max-w-6xl mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold text-slate-100 mb-8">Branding & Customization</h1>

            <div className="grid lg:grid-cols-2 gap-12">
                {/* Editor Column */}
                <div className="space-y-8">
                    {/* Identity */}
                    <Section title="Identity">
                        <Field label="Brand Name">
                            <input name="brandName" value={config.brandName} onChange={handleChange} className="input-dark w-full" placeholder="e.g. Acme Agency" />
                        </Field>
                        <Field label="Tagline">
                            <input name="tagline" value={config.tagline} onChange={handleChange} className="input-dark w-full" placeholder="e.g. Digital Growth Experts" />
                        </Field>
                        <Field label="Logo">
                            <div className="flex items-center gap-4">
                                {config.logoUrl && <img src={config.logoUrl} className="h-12 w-auto object-contain bg-white rounded p-1" />}
                                <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary text-sm">Upload Logo</button>
                                <input type="file" ref={fileInputRef} onChange={handleLogoUpload} className="hidden" accept="image/*" />
                            </div>
                        </Field>
                    </Section>

                    {/* Colors */}
                    <Section title="Colors">
                        <div className="grid grid-cols-3 gap-4">
                            <Field label="Primary">
                                <div className="flex items-center gap-2">
                                    <input type="color" name="primaryColor" value={config.primaryColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                                    <input name="primaryColor" value={config.primaryColor} onChange={handleChange} className="input-dark w-full font-mono text-sm" />
                                </div>
                            </Field>
                            <Field label="Secondary">
                                <div className="flex items-center gap-2">
                                    <input type="color" name="secondaryColor" value={config.secondaryColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                                    <input name="secondaryColor" value={config.secondaryColor} onChange={handleChange} className="input-dark w-full font-mono text-sm" />
                                </div>
                            </Field>
                            <Field label="Accent">
                                <div className="flex items-center gap-2">
                                    <input type="color" name="accentColor" value={config.accentColor} onChange={handleChange} className="h-10 w-10 rounded cursor-pointer" />
                                    <input name="accentColor" value={config.accentColor} onChange={handleChange} className="input-dark w-full font-mono text-sm" />
                                </div>
                            </Field>
                        </div>
                    </Section>

                    {/* Contact */}
                    <Section title="Contact Info">
                        <Field label="Public Email">
                            <input name="contactEmail" value={config.contactEmail} onChange={handleChange} className="input-dark w-full" />
                        </Field>
                    </Section>

                    {/* Footer */}
                    <Section title="Footer">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" name="showPoweredBy" checked={config.showPoweredBy} onChange={handleChange} className="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-500 focus:ring-blue-500" />
                            <span className="text-slate-300">Show "Powered by ProposalOS"</span>
                        </label>
                        <p className="text-xs text-slate-500 ml-8 mt-1">Requires Agency Plan to disable.</p>
                    </Section>

                    <div className="pt-4">
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary w-full">
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>

                {/* Preview Column */}
                <div className="sticky top-10">
                    <h3 className="text-xl font-bold text-slate-300 mb-4">Live Preview</h3>
                    <div className="border border-slate-700 rounded-xl overflow-hidden bg-white shadow-2xl">
                        {/* Header Preview */}
                        <div className="bg-slate-900 text-white p-6" style={{ background: `linear-gradient(to right, ${config.primaryColor}, ${config.secondaryColor})` }}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    {config.logoUrl ? (
                                        <img src={config.logoUrl} className="h-10 w-auto bg-white/20 p-1 rounded" />
                                    ) : (
                                        <div className="h-10 w-10 bg-white/20 rounded flex items-center justify-center font-bold">L</div>
                                    )}
                                    <span className="font-bold text-lg">{config.brandName || 'Your Brand'}</span>
                                </div>
                                <div className="text-sm opacity-90">{config.contactEmail || 'contact@example.com'}</div>
                            </div>
                            <div className="mt-8">
                                <h1 className="text-3xl font-bold">Digital Audit: Client Business</h1>
                                <p className="mt-2 opacity-80">{config.tagline || 'Digital Presence Assessment'}</p>
                            </div>
                        </div>

                        {/* Content Preview */}
                        <div className="p-8 bg-gray-50 min-h-[400px]">
                            <div className="h-4 w-3/4 bg-gray-200 rounded mb-4"></div>
                            <div className="h-4 w-1/2 bg-gray-200 rounded mb-8"></div>

                            <div className="p-4 bg-white rounded shadow-sm border border-gray-100 flex gap-4 border-l-4" style={{ borderLeftColor: config.accentColor }}>
                                <div className="w-12 h-12 bg-gray-100 rounded-full flex-shrink-0"></div>
                                <div>
                                    <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
                                    <div className="h-3 w-48 bg-gray-100 rounded"></div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Preview */}
                        <div className="bg-slate-900 text-slate-400 p-6 text-center text-sm">
                            <p>© 2026 {config.brandName || 'Your Brand'}. All rights reserved.</p>
                            {config.showPoweredBy && (
                                <p className="mt-2 text-xs opacity-50">Powered by ProposalOS</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: any) {
    return (
        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
            <div className="space-y-4">{children}</div>
        </div>
    );
}

function Field({ label, children }: any) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
            {children}
        </div>
    );
}
