"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ExternalLink, RefreshCw, Archive } from "lucide-react";

export default function ProposalsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    const { data, isLoading } = useQuery({
        queryKey: ['proposals', search, statusFilter],
        queryFn: async () => {
            const res = await fetch(`/api/proposals?search=${encodeURIComponent(search)}&status=${statusFilter}`);
            if (!res.ok) throw new Error('Failed to fetch proposals');
            return res.json();
        },
    });

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            DRAFT: "bg-gray-500/10 text-gray-400 border-gray-500/20",
            SENT: "bg-blue-500/10 text-blue-500 border-blue-500/20",
            VIEWED: "bg-purple-500/10 text-purple-500 border-purple-500/20",
            ACCEPTED: "bg-green-500/10 text-green-500 border-green-500/20",
            DECLINED: "bg-red-500/10 text-red-500 border-red-500/20",
            REJECTED: "bg-red-500/10 text-red-500 border-red-500/20",
        };
        return <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.DRAFT}`}>{status}</span>;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Proposals</h1>
                    <p className="text-text-secondary mt-1">Track sent proposals, views, and acceptances.</p>
                </div>
            </div>

            <Card className="bg-bg-secondary border-white/10">
                <CardHeader className="py-4 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <CardTitle className="text-lg font-medium text-white">All Proposals</CardTitle>
                    <div className="flex items-center gap-2">
                        <select
                            aria-label="Filter by status"
                            className="bg-white/5 border border-white/10 text-white text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-accent-primary"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="DRAFT">Draft</option>
                            <option value="SENT">Sent</option>
                            <option value="VIEWED">Viewed</option>
                            <option value="ACCEPTED">Accepted</option>
                            <option value="DECLINED">Declined</option>
                            <option value="REJECTED">Rejected</option>
                        </select>
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
                            <Input
                                placeholder="Search business..."
                                className="bg-white/5 border-white/10 pl-9 text-white focus-visible:ring-accent-primary"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-text-secondary uppercase bg-white/5 border-b border-white/10">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Business</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium">Tier / Value</th>
                                    <th className="px-6 py-4 font-medium">Views</th>
                                    <th className="px-6 py-4 font-medium">Last Viewed</th>
                                    <th className="px-6 py-4 font-medium">Date Created</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {isLoading ? (
                                    Array(5).fill(0).map((_, i) => (
                                        <tr key={i} className="bg-bg-secondary">
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-32 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-6 w-20 bg-white/10 rounded-full" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-24 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-8 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-20 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-24 bg-white/10" /></td>
                                            <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-8 ml-auto bg-white/10" /></td>
                                        </tr>
                                    ))
                                ) : data?.proposals?.length > 0 ? (
                                    data.proposals.map((proposal: any, i: number) => (
                                        <motion.tr
                                            key={proposal.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: i * 0.05 }}
                                            className="hover:bg-white/5 cursor-pointer transition-colors"
                                            onClick={() => router.push(`/proposal/${proposal.webLinkToken}`)}
                                        >
                                            <td className="px-6 py-4 font-medium text-white">{proposal.businessName}</td>
                                            <td className="px-6 py-4">{getStatusBadge(proposal.status)}</td>
                                            <td className="px-6 py-4 text-white">
                                                {proposal.tierChosen ? <span className="capitalize">{proposal.tierChosen}</span> : '-'}
                                                {proposal.dealValue > 0 ? ` ($${proposal.dealValue})` : ''}
                                            </td>
                                            <td className="px-6 py-4 text-text-secondary">{proposal.views}</td>
                                            <td className="px-6 py-4 text-text-secondary">
                                                {proposal.lastViewedAt ? format(new Date(proposal.lastViewedAt), "MMM d, h:mm a") : 'Never'}
                                            </td>
                                            <td className="px-6 py-4 text-text-secondary">
                                                {format(new Date(proposal.createdAt), "MMM d, yyyy")}
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-white hover:bg-white/10" title="Resend">
                                                    <RefreshCw className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-white hover:bg-white/10" title="Archive">
                                                    <Archive className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-white hover:bg-white/10" title="View Proposal">
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </motion.tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-text-secondary">
                                            No proposals found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
