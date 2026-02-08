import { prisma } from '@/lib/prisma';

export default async function PluginsPage() {
    // Fetch installed plugins
    // const installed = await prisma.pluginInstallation.findMany(...)

    // Mock
    const installed = [
        {
            id: '1',
            name: 'Yelp Deep Dive',
            status: 'Active',
            config: { 'apiKey': '****' }
        }
    ];

    return (
        <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">My Plugins</h1>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {installed.map(p => (
                    <div key={p.id} className="p-6 border-b border-slate-100 last:border-0 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-slate-900">{p.name}</h3>
                            <div className="text-sm text-green-600 flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full" /> {p.status}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button className="text-slate-500 hover:text-slate-800 text-sm font-bold">Settings</button>
                            <button className="text-red-500 hover:text-red-700 text-sm font-bold">Uninstall</button>
                        </div>
                    </div>
                ))}
                {installed.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        No plugins installed. Visit the <a href="/marketplace" className="text-indigo-600 underline">Marketplace</a>.
                    </div>
                )}
            </div>
        </div>
    );
}
