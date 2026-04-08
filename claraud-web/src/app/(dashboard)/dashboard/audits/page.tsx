"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";
import { useAudits } from "@/hooks/useDashboardData";

export default function AuditsPage() {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");

    const { data, isLoading } = useAudits(page);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'COMPLETE': return 'bg-green-500/10 text-green-500 border-green-500/20';
            case 'RUNNING': return 'bg-blue-500/10 text-blue-500 border-blue-500/20 animate-pulse';
            case 'FAILED': return 'bg-red-500/10 text-red-500 border-red-500/20';
            default: return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Audits</h1>
                    <p className="text-text-secondary mt-1">Manage and view your generated business audits.</p>
                </div>
                <Button asChild className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold">
                    <Link href="/scan"><Plus className="mr-2 h-4 w-4" /> Run New Audit</Link>
                </Button>
            </div>

            <Card className="bg-bg-secondary border-white/10">
                <CardHeader className="py-4 border-b border-white/5 flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-medium text-white">All Audits</CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-secondary" />
                        <Input
                            placeholder="Search business..."
                            className="bg-white/5 border-white/10 pl-9 text-white focus-visible:ring-accent-primary"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-text-secondary uppercase bg-white/5 border-b border-white/10">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Business</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium">Score</th>
                                    <th className="px-6 py-4 font-medium">Findings</th>
                                    <th className="px-6 py-4 font-medium">Date</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {isLoading ? (
                                    Array(5).fill(0).map((_, i) => (
                                        <tr key={i} className="bg-bg-secondary">
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-32 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-20 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-12 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-12 bg-white/10" /></td>
                                            <td className="px-6 py-4"><Skeleton className="h-4 w-24 bg-white/10" /></td>
                                            <td className="px-6 py-4 text-right"><Skeleton className="h-8 w-8 ml-auto bg-white/10" /></td>
                                        </tr>
                                    ))
                                ) : data?.audits?.length > 0 ? (
                                    data.audits.map((audit: any, i: number) => (
                                        <motion.tr
                                            key={audit.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: i * 0.05 }}
                                            className="hover:bg-white/5 cursor-pointer transition-colors"
                                            onClick={() => router.push(`/report/${audit.id}`)} // Using ID as token placeholder since token isn't in scope
                                        >
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-white">{audit.businessName}</div>
                                                {audit.businessUrl && <div className="text-xs text-text-secondary truncate max-w-[200px]">{audit.businessUrl}</div>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(audit.status)}`}>
                                                    {audit.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-white font-medium">
                                                {audit.score !== null ? `${audit.score}/100` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-text-secondary">
                                                {audit.findingsCount}
                                            </td>
                                            <td className="px-6 py-4 text-text-secondary">
                                                {format(new Date(audit.createdAt), "MMM d, yyyy")}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-text-secondary hover:text-white hover:bg-white/10">
                                                    <ExternalLink className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </motion.tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">
                                            <div className="flex flex-col items-center justify-center">
                                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                                    <Search className="h-6 w-6 text-white/20" />
                                                </div>
                                                <p className="text-lg font-medium text-white mb-1">No audits found</p>
                                                <p className="text-sm">Try adjusting your search or run a new audit.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {data?.pagination && data.pagination.pages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
                            <span className="text-sm text-text-secondary">
                                Page {page} of {data.pagination.pages}
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-transparent border-white/10 text-white hover:bg-white/5"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-transparent border-white/10 text-white hover:bg-white/5"
                                    onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
                                    disabled={page === data.pagination.pages}
                                >
                                    Next <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
