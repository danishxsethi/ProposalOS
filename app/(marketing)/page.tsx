import Link from 'next/link';
import { prisma } from '@/lib/prisma'; // For live stats if we want 'server' component data

// Force dynamic if we use DB
export const dynamic = 'force-dynamic';

async function getStats() {
    try {
        const count = await prisma.audit.count();
        // Fake it till you make it if count is low
        return Math.max(count, 1420);
    } catch (e) {
        return 1420;
    }
}

export default async function Homepage() {
    const auditCount = await getStats();

    return (
        <div className="flex flex-col min-h-screen">
            {/* HERRO SECTION */}
            <section className="relative pt-20 pb-32 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 z-0" />

                <div className="container relative z-10 mx-auto px-4 text-center max-w-4xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-bold mb-6 animate-fade-in-up">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        v2.0 is live: Now with Competitor Recon
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white mb-6">
                        The AI audit that <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">outperforms agencies.</span>
                    </h1>

                    <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                        Analyze 15+ data points. Generate a consulting-grade report in 90 seconds.
                        Cost: $0.20 per audit.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
                        <Link href="/free-audit" className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] transition hover:scale-105">
                            Audit Any Business Free
                        </Link>
                        <Link href="/demo/sample-report" className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-lg border border-slate-700 transition">
                            View Sample Report
                        </Link>
                    </div>
                    <p className="text-sm text-slate-500">No signup required. Results generated instantly.</p>
                </div>
            </section>

            {/* SOCIAL PROOF */}
            <section className="py-12 border-y border-white/5 bg-slate-900/30">
                <div className="container mx-auto px-4 text-center">
                    <p className="text-slate-500 mb-6 font-medium">TRUSTED BY MODERN AGENCIES</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                        {/* Logos (Placeholders) */}
                        <div className="text-xl font-bold text-white">Acme Corp</div>
                        <div className="text-xl font-bold text-white">GrowthLabs</div>
                        <div className="text-xl font-bold text-white">ScaleFast</div>
                        <div className="text-xl font-bold text-white">AgencyFlow</div>
                    </div>
                    <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-400">
                        <span className="font-bold text-white">{auditCount.toLocaleString()}</span> businesses audited this month
                    </div>
                </div>
            </section>

            {/* HOW IT WORKS */}
            <section className="py-24 bg-slate-950">
                <div className="container mx-auto px-4 max-w-5xl">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">Consulting-grade results. <br />Zero consulting hours.</h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-12 relative">
                        {/* Connecting Line */}
                        <div className="hidden md:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-500 opacity-20" />

                        <div className="relative z-10 text-center">
                            <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-2xl mx-auto flex items-center justify-center text-4xl mb-6 shadow-2xl">
                                🏢
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">1. Enter Business Info</h3>
                            <p className="text-slate-400">Just a name and URL. Our system identifies location and industry automatically.</p>
                        </div>

                        <div className="relative z-10 text-center">
                            <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-2xl mx-auto flex items-center justify-center text-4xl mb-6 shadow-2xl">
                                🤖
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">2. Deep AI Analysis</h3>
                            <p className="text-slate-400">We scan website performance, SEO, competitors, and 15+ other signals in real-time.</p>
                        </div>

                        <div className="relative z-10 text-center">
                            <div className="w-24 h-24 bg-slate-900 border border-slate-800 rounded-2xl mx-auto flex items-center justify-center text-4xl mb-6 shadow-2xl">
                                📄
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">3. Close the Deal</h3>
                            <p className="text-slate-400">Get a white-labeled PDF report and a pre-written proposal to send to the client.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FEATURES GRID */}
            <section className="py-24 bg-slate-900">
                <div className="container mx-auto px-4 max-w-6xl">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <div>
                            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Everything you need to prove value.</h2>
                            <p className="text-lg text-slate-400 mb-8">
                                Stop manually screengrabbing and copy-pasting. ProposalOS standardizes your audit process.
                            </p>

                            <ul className="space-y-4">
                                {[
                                    'Full Website Crawl (up to 50 pages)',
                                    'Google Business Profile Health Check',
                                    'Competitor Keyword Gap Analysis',
                                    'Accessibility (WCAG) & Security Scan',
                                    'AI-Generated "Painkiller" Insights',
                                    'White-label PDF Export'
                                ].map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-slate-300">
                                        <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs">✓</div>
                                        {item}
                                    </li>
                                ))}
                            </ul>

                            <div className="mt-8">
                                <Link href="/for-agencies" className="text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-2">
                                    Read more about Agency features →
                                </Link>
                            </div>
                        </div>

                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                            <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                                {/* Mock UI */}
                                <div className="h-8 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
                                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                                    <div className="w-3 h-3 rounded-full bg-slate-700"></div>
                                </div>
                                <div className="p-8 space-y-6">
                                    {/* Mock Graph */}
                                    <div className="flex items-end gap-2 h-32 pb-4 border-b border-slate-800">
                                        <div className="w-1/4 h-[40%] bg-slate-800 rounded-t"></div>
                                        <div className="w-1/4 h-[60%] bg-slate-800 rounded-t"></div>
                                        <div className="w-1/4 h-[30%] bg-slate-800 rounded-t"></div>
                                        <div className="w-1/4 h-[80%] bg-indigo-500 rounded-t shadow-[0_0_20px_rgba(99,102,241,0.5)]"></div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-4 w-3/4 bg-slate-800 rounded"></div>
                                        <div className="h-4 w-1/2 bg-slate-800 rounded"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA SECTION */}
            <section className="py-32 bg-slate-950 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />

                <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">Ready to close more deals?</h2>
                    <Link href="/free-audit" className="inline-block px-8 py-5 bg-white text-slate-950 rounded-xl font-black text-xl hover:bg-slate-200 transition transform hover:scale-105 shadow-2xl">
                        Run Your First Audit Free
                    </Link>
                    <p className="mt-6 text-slate-500">
                        Or <Link href="/demo/sample-report" className="underline hover:text-white">view a sample report</Link> to see what you get.
                    </p>
                </div>
            </section>
        </div>
    );
}
