import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: {
        template: '%s | ProposalOS',
        default: 'ProposalOS - AI Audit Engine for Agencies',
    },
    description: 'Generate consulting-grade digital presence audits in 90 seconds.',
};

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-white">
                        <span className="text-indigo-500">⚡️</span> ProposalOS
                    </Link>

                    <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
                        <Link href="/for-agencies" className="hover:text-white transition">For Agencies</Link>
                        <Link href="/demo/sample-report" className="hover:text-white transition">Sample Report</Link>
                        <Link href="/docs/api" className="hover:text-white transition">API</Link>
                    </nav>

                    <div className="flex items-center gap-4">
                        <Link href="/login" className="text-sm font-medium text-white hover:text-indigo-400 transition hidden sm:block">
                            Log In
                        </Link>
                        <Link href="/free-audit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-lg shadow-indigo-500/20">
                            Get Free Score
                        </Link>
                    </div>
                </div>
            </header>

            <main>
                {children}
            </main>

            {/* Footer */}
            <footer className="border-t border-white/5 bg-slate-900/50 py-12">
                <div className="container mx-auto px-4 md:px-6 grid md:grid-cols-4 gap-8 text-sm">
                    <div className="space-y-4">
                        <div className="font-bold text-lg text-white">ProposalOS</div>
                        <p className="text-slate-500">
                            The standard for automated digital auditing.
                        </p>
                    </div>
                    <div>
                        <h4 className="font-bold text-white mb-4">Product</h4>
                        <ul className="space-y-2 text-slate-500">
                            <li><Link href="/for-agencies" className="hover:text-indigo-400">For Agencies</Link></li>
                            <li><Link href="/demo/sample-report" className="hover:text-indigo-400">Sample Report</Link></li>
                            <li><Link href="/docs/api" className="hover:text-indigo-400">API Docs</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-white mb-4">Resources</h4>
                        <ul className="space-y-2 text-slate-500">
                            <li><Link href="/blog" className="hover:text-indigo-400">Blog</Link></li>
                            <li><Link href="/free-audit" className="hover:text-indigo-400">Free Audit</Link></li>
                            <li><a href="#" className="hover:text-indigo-400">Success Stories</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-bold text-white mb-4">Legal</h4>
                        <ul className="space-y-2 text-slate-500">
                            <li><a href="#" className="hover:text-indigo-400">Privacy Policy</a></li>
                            <li><a href="#" className="hover:text-indigo-400">Terms of Service</a></li>
                        </ul>
                    </div>
                </div>
                <div className="container mx-auto px-4 mt-8 pt-8 border-t border-white/5 text-center text-slate-600 text-xs">
                    © {new Date().getFullYear()} ProposalOS. All rights reserved.
                </div>
            </footer>
        </div>
    );
}
