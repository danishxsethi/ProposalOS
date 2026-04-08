import Link from 'next/link';
import { ScanInput } from '@/components/scan/scan-input';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: "Free Business Audit | Claraud",
};

export default function ScanPage() {
    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center px-4 py-16">
            {/* Back link */}
            <div className="w-full max-w-xl mb-8">
                <Link href="/" className="text-sm text-text-secondary hover:text-white transition-colors">
                    ← Back to home
                </Link>
            </div>

            {/* Heading */}
            <div className="w-full max-w-xl text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h1 className="text-4xl font-bold text-white tracking-tight mb-3">
                    Scan your business
                </h1>
                <p className="text-text-secondary">
                    Enter your website URL or business name. Results in 30 seconds.
                </p>
            </div>

            {/* Main Interactive Island */}
            <div className="w-full max-w-xl mb-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
                <ScanInput variant="large" />
            </div>

            {/* How it works mini-explainer */}
            <div className="flex items-center gap-4 mt-10 text-sm text-text-secondary animate-in fade-in slide-in-from-bottom-6 duration-1000">
                {[
                    { icon: '🔍', label: 'Scan' },
                    { icon: '🧠', label: 'Diagnose' },
                    { icon: '🔧', label: 'Fix' },
                ].map((step, i) => (
                    <div key={step.label} className="flex items-center gap-2">
                        <span className="flex items-center gap-2"><span>{step.icon}</span> <span>{step.label}</span></span>
                        {i < 2 && <span className="text-white/20 ml-2">→</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}