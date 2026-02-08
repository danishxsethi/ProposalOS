'use client';

import { useState } from 'react';

export function AuditAFriend({ referrerAuditId }: { referrerAuditId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<'FORM' | 'SENT'>('FORM');
    const [friendName, setFriendName] = useState('');
    const [friendUrl, setFriendUrl] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // In real app: call API to queue audit and email them
        // /api/referral/audit
        setStep('SENT');
        setTimeout(() => {
            setIsOpen(false);
            setStep('FORM');
            setFriendName('');
            setFriendUrl('');
        }, 3000);
    };

    if (!isOpen) {
        return (
            <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-xl p-6 flex items-center justify-between">
                <div>
                    <h3 className="text-white font-bold text-lg">Know another business that needs this?</h3>
                    <p className="text-indigo-200 text-sm">Send them a free audit. Be the hero.</p>
                </div>
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-white text-indigo-900 font-bold px-6 py-2 rounded-lg hover:bg-indigo-50 transition"
                >
                    Send Free Audit
                </button>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
            {step === 'FORM' ? (
                <form onSubmit={handleSubmit}>
                    <h3 className="text-white font-bold mb-4">Send a Free Audit</h3>
                    <div className="space-y-4 mb-4">
                        <input
                            className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white"
                            placeholder="Friend's Business Name"
                            value={friendName}
                            onChange={e => setFriendName(e.target.value)}
                            required
                        />
                        <input
                            className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white"
                            placeholder="Their Website URL"
                            value={friendUrl}
                            onChange={e => setFriendUrl(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            className="flex-1 bg-slate-800 text-white py-2 rounded font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-indigo-600 text-white py-2 rounded font-bold"
                        >
                            Send It 🚀
                        </button>
                    </div>
                </form>
            ) : (
                <div className="text-center py-8">
                    <div className="text-4xl mb-2">✅</div>
                    <h3 className="text-white font-bold">Sent!</h3>
                    <p className="text-slate-400">They'll thank you later.</p>
                </div>
            )}
        </div>
    );
}
