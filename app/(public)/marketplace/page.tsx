import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Star } from 'lucide-react';

export default async function MarketplacePage() {
    // Mock Data (would be from DB)
    const plugins = [
        {
            id: '1',
            name: 'Yelp Deep Dive',
            desc: 'Analyze Yelp reviews and photos for advanced reputation insights.',
            author: 'ProposalOS',
            price: 'Free',
            rating: 4.8,
            installs: 120,
            icon: '🔴'
        },
        {
            id: '2',
            name: 'ADA Cost Estimator',
            desc: 'Estimate remediation costs for accessibility issues automatically.',
            author: 'ComplianceAI',
            price: '$29/mo',
            rating: 5.0,
            installs: 45,
            icon: '♿'
        },
        {
            id: '3',
            name: 'Email Deliverability',
            desc: 'Check SPF, DKIM, DMARC records to ensure emails land in inboxes.',
            author: 'MailTech',
            price: '$9/mo',
            rating: 4.5,
            installs: 89,
            icon: '📧'
        }
    ];

    return (
        <div className="bg-slate-50 min-h-screen">
            <div className="bg-slate-900 text-white py-20">
                <div className="container mx-auto px-6 text-center">
                    <h1 className="text-4xl font-bold mb-4">Plugin Marketplace</h1>
                    <p className="text-xl text-slate-300 max-w-2xl mx-auto">
                        Extend ProposalOS with powerful modules built by the community.
                    </p>
                </div>
            </div>

            <div className="container mx-auto px-6 py-12">
                <div className="grid md:grid-cols-3 gap-8">
                    {plugins.map(p => (
                        <div key={p.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="text-4xl">{p.icon}</div>
                                    <div className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">
                                        {p.price}
                                    </div>
                                </div>
                                <h3 className="font-bold text-lg text-slate-900 mb-1">{p.name}</h3>
                                <div className="text-xs text-slate-500 mb-4">by {p.author}</div>
                                <p className="text-slate-600 text-sm mb-6 h-12 overflow-hidden">{p.desc}</p>

                                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                                    <div className="flex items-center gap-1 text-yellow-500 text-sm font-bold">
                                        <Star size={14} fill="currentColor" /> {p.rating}
                                        <span className="text-slate-400 font-normal ml-1">({p.installs})</span>
                                    </div>
                                    <button className="text-indigo-600 font-bold text-sm hover:underline">View Details</button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
