import Link from 'next/link';

export function DashboardSidebar({ user }: { user: any }) {
    return (
        <aside className="w-64 border-r border-white/10 bg-bg-secondary hidden md:flex flex-col p-4">
            <div className="font-bold text-xl mb-8 text-white">Claraud Dashboard</div>
            <nav className="flex flex-col gap-2">
                <Link href="/dashboard" className="text-text-secondary hover:text-white px-3 py-2 rounded-md hover:bg-white/5">Overview</Link>
                <Link href="/dashboard/audits" className="text-text-secondary hover:text-white px-3 py-2 rounded-md hover:bg-white/5">Audits</Link>
                <Link href="/dashboard/proposals" className="text-text-secondary hover:text-white px-3 py-2 rounded-md hover:bg-white/5">Proposals</Link>
                <Link href="/dashboard/settings" className="text-text-secondary hover:text-white px-3 py-2 rounded-md hover:bg-white/5">Settings</Link>
            </nav>
        </aside>
    );
}
