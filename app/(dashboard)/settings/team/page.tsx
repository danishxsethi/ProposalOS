'use client';

import { useEffect, useState } from 'react';

export default function TeamSettingsPage() {
  const [team, setTeam] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadTeam = async () => {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) throw new Error(`Could not load team (${res.status})`);
      const data = await res.json();
      setTeam(data.team ?? []);
      setInvites(data.invites ?? []);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load team');
    }
  };

  useEffect(() => {
    void loadTeam();
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
        setShowInviteModal(false);
        await loadTeam();
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

      {loadError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {loadError}
        </div>
      )}

      {/* Team List */}
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-700 font-semibold text-slate-300">
          Members <span className="ml-2 text-xs font-normal text-slate-500">{team.length}</span>
        </div>
        <ul className="divide-y divide-slate-700">
          {team.map((member) => {
            const display = member.name || member.email || 'Member';
            return (
              <li key={member.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-4">
                  <div aria-hidden="true" className="w-10 h-10 shrink-0 rounded-full bg-blue-900 text-blue-200 flex items-center justify-center font-bold">
                    {display.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white font-medium truncate">{display}</div>
                    <div className="text-slate-400 text-sm truncate">{member.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {member.status !== 'active' && (
                    <span className="text-xs text-amber-300">Unverified</span>
                  )}
                  <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded capitalize">
                    {member.role}
                  </span>
                </div>
              </li>
            );
          })}
          {team.length === 0 && !loadError && (
            <li className="px-6 py-8 text-sm text-slate-400">No members yet.</li>
          )}
        </ul>
      </div>

      {invites.length > 0 && (
        <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-slate-700 font-semibold text-slate-300">Pending invitations</div>
          <ul className="divide-y divide-slate-700">
            {invites.map((invite) => (
              <li key={invite.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-slate-200 truncate">{invite.email}</span>
                <span className="text-slate-400">
                  {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-4">Invite Team Member</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Role</label>
                <select
                  name="role"
                  className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-white"
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded"
                >
                  Send Invite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
