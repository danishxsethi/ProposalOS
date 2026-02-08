import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // Role check would go here

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
            <header className="sticky top-0 z-40 border-b border-indigo-500/20 bg-slate-950/80 backdrop-blur-md p-4">
                <div className="container mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-8">
                        <span className="font-bold text-indigo-400 flex items-center gap-2">
                            <span>⚡️</span> ProposalOS Admin
                        </span>
                        <nav className="hidden md:flex gap-6 text-sm font-medium text-slate-400">
                            <AdminLink href="/admin/metrics">Metrics</AdminLink>
                            <AdminLink href="/admin/tenants">Tenants</AdminLink>
                            <AdminLink href="/admin/audits">Audits</AdminLink>
                            <AdminLink href="/admin/health">Health</AdminLink>
                            <AdminLink href="/admin/flags">Flags</AdminLink>
                            <AdminLink href="/admin/support">Support</AdminLink>
                        </nav>
                    </div>
                    <Link href="/dashboard" className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded transition">
                        Exit to App
                    </Link>
                </div>
            </header>
            <main className="container mx-auto p-6">
                {children}
            </main>
        </div>
    );
}

function AdminLink({ href, children }: { href: string, children: React.ReactNode }) {
    return (
        <Link href={href} className="hover:text-white transition hover:bg-white/5 px-2 py-1 rounded">
            {children}
        </Link>
    );
}
