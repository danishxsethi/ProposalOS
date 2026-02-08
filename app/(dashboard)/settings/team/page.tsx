'use client';

import { useState, useEffect } from 'react';

export default function TeamSettingsPage() {
    const [team, setTeam] = useState<any[]>([]);
    const [invites, setInvites] = useState<any[]>([]);
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Fetch Team & Invites
    useEffect(() => {
        // Mock fetch for now, replace with actual API
        // const res = await fetch('/api/team'); 
        // setTeam(res.team);
        // setInvites(res.invites);
        setTeam([
            { id: '1', name: 'Alice Owner', email: 'alice@example.com', role: 'owner', status: 'active' },
            { id: '2', name: 'Bob Admin', email: 'bob@example.com', role: 'admin', status: 'active' },
        ]);
        setInvites([]);
    }, []);

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const email = (form.elements.namedItem('email') as HTMLInputElement).value;
        const role = (form.elements.namedItem('role') as HTMLSelectElement).value;

        try {
            const res = await fetch('/api/team/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            });
            const data = await res.json();
            if (res.ok) {
                alert('Invite sent!');
                setShowInviteModal(false);
                // Refresh list
            } else {
                alert(data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Failed to send invite');
        }
    };

    return (
        <div className="container max-w-5xl mx-auto py-10 px-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Team Management</h1>
                    <p className="text-slate-400">Manage access and roles for your agency.</p>
                </div>
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    + Invite Member
                </button>
            </div>

            {/* Team List */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-slate-700 font-semibold text-slate-300">
                    Active Members
                </div>
                <div className="divide-y divide-slate-700">
                    {team.map((member) => (
                        <div key={member.id} className="px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-blue-900 text-blue-200 flex items-center justify-center font-bold">
                                    {member.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <div className="text-white font-medium">{member.name}</div>
                                    <div className="text-slate-400 text-sm">{member.email}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded capitalize">
                                    {member.role}
                                </span>
                                {/* Owner can remove non-owners */}
                                <button className="text-red-400 hover:text-red-300 text-sm">Remove</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold text-white mb-4">Invite Team Member</h2>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                                <input name="email" type="email" required className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                                <select name="role" className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white">
                                    <option value="viewer">Viewer</option>
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-white">Cancel</button>
                                <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">Send Invite</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
