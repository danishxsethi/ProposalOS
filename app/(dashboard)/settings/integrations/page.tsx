import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function IntegrationsPage() {
    // In real implementation, fetch active connections status
    // const connections = await prisma.integrationConnection.findMany(...)

    return (
        <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Integrations</h1>
            <p className="text-slate-500 mb-8">Connect your favorite tools to automate your workflow.</p>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* HubSpot */}
                <IntegrationCard
                    name="HubSpot"
                    desc="Sync deal stages and contacts automatically."
                    icon="🟠"
                    connected={false}
                />

                {/* Pipedrive */}
                <IntegrationCard
                    name="Pipedrive"
                    desc="Create deals when proposals are accepted."
                    icon="🟢"
                    connected={false}
                />

                {/* Slack */}
                <IntegrationCard
                    name="Slack"
                    desc="Get notified in #sales when you win."
                    icon="🟣"
                    connected={true} // Mock
                />

                {/* Webhooks */}
                <Link href="/settings/webhooks" className="bg-white border border-slate-200 p-6 rounded-xl hover:shadow-md hover:border-indigo-400 transition-all">
                    <div className="flex justify-between items-start mb-4">
                        <div className="text-3xl">🔌</div>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-bold">Native</span>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-2">Webhooks</h3>
                    <p className="text-slate-500 text-sm mb-4">Send data to Zapier, Make, or your own server.</p>
                    <div className="text-indigo-600 font-bold text-sm">Manage Webhooks &rarr;</div>
                </Link>
            </div>
        </div>
    );
}

function IntegrationCard({ name, desc, icon, connected }: any) {
    return (
        <div className="bg-white border border-slate-200 p-6 rounded-xl">
            <div className="flex justify-between items-start mb-4">
                <div className="text-3xl">{icon}</div>
                {connected ? (
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">Active</span>
                ) : (
                    <button className="bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold hover:bg-slate-800">Connect</button>
                )}
            </div>
            <h3 className="font-bold text-slate-900 mb-2">{name}</h3>
            <p className="text-slate-500 text-sm">{desc}</p>
        </div>
    );
}
