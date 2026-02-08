
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Schedule {
    id: string;
    businessName: string;
    description: string;
    frequency: string;
    nextRunAt: string;
    lastRunAt: string | null;
    isActive: boolean;
}

export default function SchedulesPage() {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        businessName: '',
        businessCity: '',
        businessUrl: '',
        industry: '',
        frequency: 'weekly'
    });

    const router = useRouter();

    useEffect(() => {
        fetchSchedules();
    }, []);

    const fetchSchedules = async () => {
        try {
            const res = await fetch('/api/schedule');
            if (res.ok) {
                const data = await res.json();
                setSchedules(data);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setIsCreateModalOpen(false);
                fetchSchedules();
                setFormData({ businessName: '', businessCity: '', businessUrl: '', industry: '', frequency: 'weekly' });
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to stop monitoring this business?')) return;
        try {
            await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
            fetchSchedules();
        } catch (error) {
            console.error(error);
        }
    };

    const handleToggle = async (schedule: Schedule) => {
        try {
            await fetch(`/api/schedule/${schedule.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !schedule.isActive })
            });
            fetchSchedules();
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-100">Recurring Audits</h1>
                    <p className="text-slate-400">Automatically monitor your clients and track progress over time.</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                    + New Schedule
                </button>
            </div>

            {isLoading ? (
                <div className="text-slate-400">Loading schedules...</div>
            ) : schedules.length === 0 ? (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-12 text-center">
                    <div className="text-4xl mb-4">⏱️</div>
                    <h3 className="text-xl font-bold text-white mb-2">No Active Monitors</h3>
                    <p className="text-slate-400 mb-6">Start tracking a business to see changes over time.</p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                        Create Your First Schedule
                    </button>
                </div>
            ) : (
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 border-b border-slate-700 text-slate-400 text-sm uppercase tracking-wider">
                                <th className="p-4 font-medium">Business</th>
                                <th className="p-4 font-medium">Frequency</th>
                                <th className="p-4 font-medium">Last Run</th>
                                <th className="p-4 font-medium">Next Run</th>
                                <th className="p-4 font-medium">Status</th>
                                <th className="p-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                            {schedules.map((schedule) => (
                                <tr key={schedule.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="p-4">
                                        <div className="font-semibold text-white">{schedule.businessName}</div>
                                        <div className="text-xs text-slate-500">{schedule.description}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs capitalize">
                                            {schedule.frequency}
                                        </span>
                                    </td>
                                    <td className="p-4 text-slate-400 text-sm">
                                        {schedule.lastRunAt ? new Date(schedule.lastRunAt).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td className="p-4 text-slate-400 text-sm">
                                        {new Date(schedule.nextRunAt).toLocaleDateString()}
                                    </td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => handleToggle(schedule)}
                                            className={`px-2 py-1 rounded text-xs font-bold ${schedule.isActive ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-500'}`}
                                        >
                                            {schedule.isActive ? 'ACTIVE' : 'PAUSED'}
                                        </button>
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleDelete(schedule.id)}
                                            className="text-slate-400 hover:text-red-400 transition-colors"
                                            title="Delete"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 relative">
                        <button
                            onClick={() => setIsCreateModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white"
                        >✕</button>

                        <h2 className="text-xl font-bold text-white mb-6">Monitor New Business</h2>

                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Business Name</label>
                                <input
                                    required
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                                    placeholder="Acme Corp"
                                    value={formData.businessName}
                                    onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">City (Optional)</label>
                                <input
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                                    placeholder="New York, NY"
                                    value={formData.businessCity}
                                    onChange={e => setFormData({ ...formData, businessCity: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Website URL (Optional)</label>
                                <input
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                                    placeholder="https://acme.com"
                                    value={formData.businessUrl}
                                    onChange={e => setFormData({ ...formData, businessUrl: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Frequency</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-indigo-500 focus:outline-none"
                                    value={formData.frequency}
                                    onChange={e => setFormData({ ...formData, frequency: e.target.value })}
                                >
                                    <option value="weekly">Weekly</option>
                                    <option value="biweekly">Bi-Weekly</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-bold mt-2 transition-colors"
                            >
                                Start Monitoring
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
