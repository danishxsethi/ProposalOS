'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function BillingPage() {
    // Current state (should ideally fetch from API)
    // For now, mock or minimal fetch. Since this is client component, we'd usually fetch user+tenant in a server component wrapper or useSWR
    // To keep it simple, let's assume we fetch tenant plan details via a quick API call or prop drill

    const [loading, setLoading] = useState('');

    const handleUpgrade = async (planId: string) => {
        setLoading(planId);
        try {
            const res = await fetch('/api/billing/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId, interval: 'month' }),
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert('Failed to start checkout');
            }
        } catch (e) {
            console.error(e);
            alert('Something went wrong');
        } finally {
            setLoading('');
        }
    };

    const handlePortal = async () => {
        setLoading('portal');
        try {
            const res = await fetch('/api/billing/portal', {
                method: 'POST',
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                alert('Failed to load portal');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading('');
        }
    };

    return (
        <div className="container max-w-5xl mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold mb-2 text-slate-100">Billing & Subscription</h1>
            <p className="text-slate-400 mb-8">Manage your plan and payment details</p>

            <div className="grid md:grid-cols-3 gap-6">
                {/* Free / Trial Plan Card */}
                <PlanCard
                    title="Starter"
                    price="$99"
                    features={['25 Audits/mo', '1 Seat', 'Basic Branding']}
                    cta="Downgrade"
                    current={false}
                    onAction={() => handleUpgrade('starter')}
                    loading={loading === 'starter'}
                />

                {/* Pro Plan Card */}
                <PlanCard
                    title="Professional"
                    price="$299"
                    features={['100 Audits/mo', '3 Seats', 'Full Branding', 'Batch Mode']}
                    cta="Upgrade to Pro"
                    current={true} // For demo purpose, assume Pro Trial
                    highlight
                    onAction={() => handleUpgrade('pro')}
                    loading={loading === 'pro'}
                />

                {/* Agency Plan Card */}
                <PlanCard
                    title="Agency"
                    price="$599"
                    features={['Unlimited Audits', '10 Seats', 'White-Label', 'API Access', 'Priority Support']}
                    cta="Upgrade to Agency"
                    current={false}
                    onAction={() => handleUpgrade('agency')}
                    loading={loading === 'agency'}
                />
            </div>

            <div className="mt-12 p-6 bg-slate-800 rounded-lg border border-slate-700 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-white">Manage Subscription</h3>
                    <p className="text-slate-400 text-sm">Update credit card, download invoices, cancel plan</p>
                </div>
                <button
                    onClick={handlePortal}
                    disabled={loading === 'portal'}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                    {loading === 'portal' ? 'Loading...' : 'Open Customer Portal'}
                </button>
            </div>
        </div>
    );
}

function PlanCard({ title, price, features, cta, current, highlight, onAction, loading }: any) {
    return (
        <div className={`relative p-6 rounded-2xl border ${highlight ? 'border-blue-500 bg-slate-800/50' : 'border-slate-700 bg-slate-800/30'} flex flex-col`}>
            {highlight && (
                <div className="absolute top-0 right-0 bg-blue-600 text-xs font-bold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                    POPULAR
                </div>
            )}
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <div className="text-3xl font-bold text-white mb-6">
                {price}<span className="text-sm text-slate-400 font-normal">/mo</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
                {features.map((f: string, i: number) => (
                    <li key={i} className="flex items-center text-slate-300 text-sm">
                        <svg className="w-5 h-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {f}
                    </li>
                ))}
            </ul>
            <button
                onClick={onAction}
                disabled={current || loading}
                className={`w-full py-3 rounded-lg font-semibold transition-all ${current
                        ? 'bg-slate-700 text-slate-400 cursor-default'
                        : highlight
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                            : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
            >
                {loading ? 'Processing...' : current ? 'Current Plan' : cta}
            </button>
        </div>
    );
}
