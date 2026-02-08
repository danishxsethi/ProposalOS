import Link from 'next/link';

export default function AgencyPage() {
    return (
        <div className="bg-slate-950 min-h-screen">
            <section className="pt-24 pb-16 px-4 text-center">
                <h1 className="text-5xl font-black text-white mb-6">
                    Your Brand. <span className="text-indigo-400">Our Engine.</span>
                </h1>
                <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
                    White-label the world's most advanced digital audit engine.
                    Impress clients, close wins, and scale your agency without adding headcount.
                </p>
                <Link href="/signup?plan=agency" className="bg-white text-slate-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-200 transition">
                    Start Agency Free Trial
                </Link>
            </section>

            <section className="py-24 bg-slate-900">
                <div className="container mx-auto px-4 max-w-6xl">
                    <div className="grid md:grid-cols-2 gap-12">
                        <div className="space-y-8">
                            <Feature
                                title="Custom Domain & Branding"
                                desc="Serve reports on 'audit.youragency.com' with your logo and colors. Clients never know we exist."
                                icon="🎨"
                            />
                            <Feature
                                title="Lead Gen Widget"
                                desc="Embed our audit tool on your website. Capture leads automatically when visitors run a scan."
                                icon="⚡️"
                            />
                            <Feature
                                title="Team Collaboration"
                                desc="Invite your sales team and account managers. Centralized dashboard for all client audits."
                                icon="👥"
                            />
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 flex items-center justify-center">
                            {/* Visual Placeholder */}
                            <div className="text-center">
                                <div className="text-6xl mb-4">🤫</div>
                                <h3 className="text-xl font-bold text-white">Totally Invisible</h3>
                                <p className="text-slate-500 mt-2">No "Powered by" branding on Agency plan.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-24 text-center">
                <Link href="/signup?plan=agency" className="text-indigo-400 hover:text-white text-2xl font-bold transition">
                    Get started with 14-day free trial →
                </Link>
            </section>
        </div>
    );
}

function Feature({ title, desc, icon }: { title: string, desc: string, icon: string }) {
    return (
        <div className="flex gap-4">
            <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
                {icon}
            </div>
            <div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-slate-400">{desc}</p>
            </div>
        </div>
    );
}
