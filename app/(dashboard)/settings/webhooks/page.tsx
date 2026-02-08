import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function WebhooksPage() {
    // Fetch user's webhooks (mock tenant ID for now or grab from session)
    // const webhooks = await prisma.webhookEndpoint.findMany(...)

    // Mock Data
    const webhooks = [
        {
            id: '1',
            url: 'https://hooks.zapier.com/hooks/catch/12345/abcde',
            events: ['proposal.accepted'],
            isActive: true,
            failCount: 0,
            lastDelivered: '2 mins ago'
        }
    ];

    return (
        <div className="max-w-4xl mx-auto">
            <Link href="/settings/integrations" className="text-slate-500 text-sm hover:text-indigo-600 mb-4 inline-block">← Back to Integrations</Link>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Webhooks</h1>
                    <p className="text-slate-500">Programmatically subscribe to events.</p>
                </div>
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-indigo-700">+ Add Endpoint</button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                        <tr>
                            <th className="px-6 py-4">URL</th>
                            <th className="px-6 py-4">Events</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Last Delivery</th>
                            <th className="px-6 py-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {webhooks.map(wh => (
                            <tr key={wh.id} className="text-sm">
                                <td className="px-6 py-4 font-mono text-slate-600 truncate max-w-xs">{wh.url}</td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-1 flex-wrap">
                                        {wh.events.map(e => (
                                            <span key={e} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded textxs">{e}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {wh.isActive ? (
                                        <span className="flex items-center gap-1 text-green-600 font-bold"><span className="w-2 h-2 rounded-full bg-green-500" /> Active</span>
                                    ) : (
                                        <span className="text-red-500 font-bold">Disabled</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-slate-500">{wh.lastDelivered}</td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-indigo-600 font-bold hover:underline">Test</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {webhooks.length === 0 && (
                    <div className="p-12 text-center text-slate-400">
                        No webhooks configured. Add one to start listening to events.
                    </div>
                )}
            </div>

            <div className="mt-8 bg-slate-50 p-6 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-900 mb-2">Developer Information</h3>
                <p className="text-sm text-slate-600 mb-4">
                    Refers to our documentation for payload structures and signature verification.
                </p>
                <div className="font-mono text-xs bg-slate-900 text-white p-4 rounded-lg overflow-x-auto">
                    X-ProposalOS-Signature: sha256=757...<br />
                    X-ProposalOS-Event: proposal.accepted
                </div>
            </div>
        </div>
    );
}
