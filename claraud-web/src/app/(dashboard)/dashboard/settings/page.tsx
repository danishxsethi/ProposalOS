"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Image as ImageIcon, Key, CreditCard, Users, Plus, Copy, Trash2, CheckCircle2, ExternalLink } from "lucide-react";

const TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "branding", label: "Branding", icon: ImageIcon },
    { id: "apikeys", label: "API Keys", icon: Key },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "team", label: "Team", icon: Users }
];

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState("profile");
    const [newKeyName, setNewKeyName] = useState("");
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['settingsData'],
        queryFn: async () => {
            const res = await fetch('/api/settings');
            if (!res.ok) throw new Error('Failed to fetch settings');
            return res.json();
        },
    });

    const createKeyMutation = useMutation({
        mutationFn: async (name: string) => {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_api_key', name })
            });
            if (!res.ok) throw new Error('Failed to create key');
            return res.json();
        },
        onSuccess: (result) => {
            setCreatedKey(result.key);
            setNewKeyName("");
            queryClient.invalidateQueries({ queryKey: ['settingsData'] });
        }
    });

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
                <p className="text-text-secondary mt-1">Manage your workspace, billing, and team members.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Vertical Tabs Sidebar */}
                <div className="w-full md:w-64 flex-shrink-0">
                    <nav className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setCreatedKey(null); }}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm whitespace-nowrap \${
                            activeTab === tab.id
                                ? "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
                                : "text-text-secondary hover:text-white hover:bg-white/5 border border-transparent"
                        }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>

                {/* Tab Content */}
                <div className="flex-1 min-w-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {isLoading ? (
                                <Card className="bg-bg-secondary border-white/10">
                                    <CardContent className="p-6 space-y-4">
                                        <Skeleton className="h-8 w-1/3 bg-white/10" />
                                        <Skeleton className="h-4 w-1/2 bg-white/10 mb-8" />
                                        <Skeleton className="h-12 w-full bg-white/10" />
                                        <Skeleton className="h-12 w-full bg-white/10" />
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    {/* PROFILE TAB */}
                                    {activeTab === "profile" && (
                                        <Card className="bg-bg-secondary border-white/10">
                                            <CardHeader>
                                                <CardTitle className="text-white">Profile Information</CardTitle>
                                                <CardDescription className="text-text-secondary">Update your personal account details.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label className="text-white">Full Name</Label>
                                                    <Input defaultValue={data?.profile?.name || ""} className="bg-white/5 border-white/10 text-white" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-white">Email Address</Label>
                                                    <Input disabled defaultValue={data?.profile?.email || ""} className="bg-white/5 border-white/10 text-text-secondary cursor-not-allowed" />
                                                </div>
                                                <Button className="mt-4 bg-white/10 hover:bg-white/20 text-white">Save Changes</Button>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* BRANDING TAB */}
                                    {activeTab === "branding" && (
                                        <Card className="bg-bg-secondary border-white/10">
                                            <CardHeader>
                                                <CardTitle className="text-white">Workspace Branding</CardTitle>
                                                <CardDescription className="text-text-secondary">Customize how your reports and proposals are styled.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                <div className="space-y-2">
                                                    <Label className="text-white">Company Name</Label>
                                                    <Input defaultValue={data?.branding?.brandName || ""} className="bg-white/5 border-white/10 text-white" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-white">Primary Color</Label>
                                                        <div className="flex gap-2">
                                                            <div
                                                                className="w-10 h-10 rounded border border-white/20 color-swatch"
                                                                data-color={data?.branding?.primaryColor || '#8B5CF6'}
                                                                aria-label="Primary color preview"
                                                                ref={(el) => { if (el) el.style.backgroundColor = data?.branding?.primaryColor || '#8B5CF6'; }}
                                                            />
                                                            <Input defaultValue={data?.branding?.primaryColor || "#8B5CF6"} className="bg-white/5 border-white/10 text-white flex-1" />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-white">Logo URL</Label>
                                                        <Input placeholder="https://..." className="bg-white/5 border-white/10 text-white" />
                                                    </div>
                                                </div>
                                                <Button className="mt-4 bg-white/10 hover:bg-white/20 text-white">Save Branding</Button>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* API KEYS TAB */}
                                    {activeTab === "apikeys" && (
                                        <div className="space-y-6">
                                            <Card className="bg-bg-secondary border-white/10">
                                                <CardHeader>
                                                    <CardTitle className="text-white">Generate API Key</CardTitle>
                                                    <CardDescription className="text-text-secondary">Keys allow you to authenticate with the Proposal Engine API.</CardDescription>
                                                </CardHeader>
                                                <CardContent>
                                                    <div className="flex gap-4">
                                                        <Input
                                                            placeholder="e.g. Zapier Integration"
                                                            className="bg-white/5 border-white/10 text-white flex-1"
                                                            value={newKeyName}
                                                            onChange={e => setNewKeyName(e.target.value)}
                                                        />
                                                        <Button
                                                            className="bg-accent-primary hover:bg-accent-primary/90 text-white"
                                                            disabled={!newKeyName || createKeyMutation.isPending}
                                                            onClick={() => createKeyMutation.mutate(newKeyName)}
                                                        >
                                                            <Plus className="w-4 h-4 mr-2" /> Create Key
                                                        </Button>
                                                    </div>

                                                    {createdKey && (
                                                        <div className="mt-6 p-4 rounded-xl border border-green-500/20 bg-green-500/10 space-y-3">
                                                            <div className="flex items-center text-green-400 font-medium">
                                                                <CheckCircle2 className="w-5 h-5 mr-2" />
                                                                Key generated successfully
                                                            </div>
                                                            <p className="text-sm text-text-secondary">Make sure to copy your API key now. You won't be able to see it again!</p>
                                                            <div className="flex bg-black/40 rounded-lg p-3 font-mono text-sm text-white break-all">
                                                                {createdKey}
                                                            </div>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>

                                            <Card className="bg-bg-secondary border-white/10">
                                                <CardHeader>
                                                    <CardTitle className="text-white text-base">Active Keys</CardTitle>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="text-xs text-text-secondary uppercase bg-white/5 border-y border-white/10">
                                                            <tr>
                                                                <th className="px-6 py-4 font-medium">Name</th>
                                                                <th className="px-6 py-4 font-medium">Prefix</th>
                                                                <th className="px-6 py-4 font-medium">Created</th>
                                                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {data?.apiKeys?.map((key: any) => (
                                                                <tr key={key.id} className="hover:bg-white/5">
                                                                    <td className="px-6 py-4 text-white font-medium">{key.name}</td>
                                                                    <td className="px-6 py-4 text-text-secondary font-mono text-xs">{key.prefix}...</td>
                                                                    <td className="px-6 py-4 text-text-secondary">{format(new Date(key.createdAt), "MMM d, yyyy")}</td>
                                                                    <td className="px-6 py-4 text-right">
                                                                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">Revoke</Button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </CardContent>
                                            </Card>
                                        </div>
                                    )}

                                    {/* BILLING TAB */}
                                    {activeTab === "billing" && (
                                        <Card className="bg-bg-secondary border-white/10">
                                            <CardHeader>
                                                <CardTitle className="text-white">Billing & Plan</CardTitle>
                                                <div className="pt-2">
                                                    <span className="bg-accent-primary/20 text-accent-primary border border-accent-primary/30 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase">
                                                        Pro Plan
                                                    </span>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-text-secondary">Audits Used</span>
                                                        <span className="text-white font-medium">142 / 500</span>
                                                    </div>
                                                    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className="bg-gradient-to-r from-blue-500 to-accent-primary h-2 rounded-full w-[28%]"
                                                            role="progressbar"
                                                            title="Audit usage: 28%"
                                                            aria-valuenow={28}
                                                            aria-valuemin={0}
                                                            aria-valuemax={100}
                                                            aria-label="Audit usage 28%"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="pt-4 border-t border-white/10">
                                                    <Button className="bg-white text-black hover:bg-white/90 font-medium">
                                                        Open Stripe Portal <ExternalLink className="w-4 h-4 ml-2" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* TEAM TAB */}
                                    {activeTab === "team" && (
                                        <Card className="bg-bg-secondary border-white/10">
                                            <CardHeader>
                                                <CardTitle className="text-white">Team Members</CardTitle>
                                                <CardDescription className="text-text-secondary">Invite colleagues to collaborate in this workspace.</CardDescription>
                                            </CardHeader>
                                            <CardContent className="space-y-6 flex flex-col items-center justify-center py-12">
                                                <Users className="w-12 h-12 text-white/20 mb-2" />
                                                <p className="text-text-secondary text-sm">Team management requires an active Stripe subscription.</p>
                                                <Button disabled variant="outline" className="bg-white/5 border-white/10">Upgrade to Invite Members</Button>
                                            </CardContent>
                                        </Card>
                                    )}
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div >
    );
}
