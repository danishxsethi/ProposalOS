'use client';

import { useState, useEffect } from 'react';

export default function ProposalsPage() {
    const [proposals, setProposals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProposal, setSelectedProposal] = useState<any>(null);
    const [emailForm, setEmailForm] = useState({
        recipientEmail: '',
        subject: '',
        message: ''
    });
    const [sending, setSending] = useState(false);

    const fetchProposals = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/proposals');
            const data = await res.json();
            setProposals(data.proposals || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProposals();
    }, []);

    const openSendModal = (proposal: any) => {
        setSelectedProposal(proposal);
        setEmailForm({
            recipientEmail: proposal.prospectEmail || '',
            subject: `${proposal.audit.businessName || 'Your Business'}: Digital Presence Audit Results`,
            message: `Hi there,\n\nWe analyzed ${proposal.audit.businessName}'s digital presence and found several opportunities for growth.\n\nYou can view the full report here: ${window.location.origin}/proposal/${proposal.webLinkToken}\n\nLet's discuss how we can help you implement these fixes.\n\nBest,\nAudit Team`
        });
        setIsModalOpen(true);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            const res = await fetch(`/api/proposal/${selectedProposal.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(emailForm)
            });

            if (res.ok) {
                alert('Email sent successfully!');
                setIsModalOpen(false);
                fetchProposals();
            } else {
                const err = await res.json();
                alert(`Failed to send: ${err.error}`);
            }
        } catch (e) {
            alert('Error sending email');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="container max-w-7xl mx-auto py-10 px-4">
            <h1 className="text-3xl font-bold text-slate-100 mb-8">Proposals</h1>

            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-900/50 text-slate-400 text-sm">
                        <tr>
                            <th className="px-6 py-4">Business</th>
                            <th className="px-6 py-4">Email Found</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700">
                        {proposals.map(p => (
                            <tr key={p.id} className="hover:bg-slate-700/30">
                                <td className="px-6 py-4 text-white font-medium">{p.audit.businessName}</td>
                                <td className="px-6 py-4 text-slate-400 font-mono text-sm max-w-[200px] truncate">
                                    {p.prospectEmail || '-'}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs ${p.status === 'ACCEPTED' ? 'bg-green-500/20 text-green-400' :
                                        p.status === 'SENT' ? 'bg-blue-500/20 text-blue-400' :
                                            p.status === 'VIEWED' ? 'bg-purple-500/20 text-purple-400' :
                                                'bg-slate-700 text-slate-300'
                                        }`}>
                                        {p.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    {p.status !== 'ACCEPTED' && (
                                        <button
                                            onClick={() => openSendModal(p)}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-sm transition-colors"
                                        >
                                            Email
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full p-6 shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-4">Send Proposal</h2>

                        <form onSubmit={handleSend} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Recipient Email</label>
                                <input
                                    type="email"
                                    required
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                    value={emailForm.recipientEmail}
                                    onChange={e => setEmailForm({ ...emailForm, recipientEmail: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Subject</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                    value={emailForm.subject}
                                    onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Message</label>
                                <textarea
                                    required
                                    rows={6}
                                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                                    value={emailForm.message}
                                    onChange={e => setEmailForm({ ...emailForm, message: e.target.value })}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-slate-300 hover:text-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={sending}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
                                >
                                    {sending ? 'Sending...' : 'Send Proposal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
