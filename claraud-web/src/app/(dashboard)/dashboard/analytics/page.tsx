"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, TrendingUp, DollarSign, Activity, Users, Percent } from "lucide-react";
import { useAnalytics } from "@/hooks/useDashboardData";

export default function AnalyticsPage() {
    const { data: analytics, isLoading } = useAnalytics();

    const statCards = [
        { title: "Total Revenue", value: `$${(analytics?.overview?.totalRevenue || 0).toLocaleString()}`, icon: DollarSign, color: "text-green-500" },
        { title: "Est. MRR", value: `$${(analytics?.overview?.mrr || 0).toLocaleString()}`, icon: TrendingUp, color: "text-emerald-500" },
        { title: "Audits (30d)", value: analytics?.overview?.auditsThisMonth || 0, icon: Activity, color: "text-blue-500" },
        { title: "Proposals Sent", value: analytics?.overview?.proposalsSent || 0, icon: Users, color: "text-purple-500" },
        { title: "Conversion Rate", value: `${analytics?.overview?.conversionRate || 0}%`, icon: Percent, color: "text-orange-500" }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Analytics</h1>
                    <p className="text-text-secondary mt-1">Deep dive into your sales and auditing performance.</p>
                </div>
                <div className="flex items-center gap-3">
                    <select className="bg-white/5 border border-white/10 text-white text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-accent-primary">
                        <option value="30d">Last 30 Days</option>
                        <option value="month">This Month</option>
                        <option value="week">This Week</option>
                        <option value="all">All Time</option>
                    </select>
                    <Button variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {statCards.map((stat, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.1 }}>
                        <Card className="bg-bg-secondary border-white/10 h-full">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                                    <span className="text-xs font-medium text-text-secondary uppercase">{stat.title}</span>
                                </div>
                                {isLoading ? <Skeleton className="h-6 w-20 bg-white/10" /> : <div className="text-2xl font-bold text-white">{stat.value}</div>}
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-bg-secondary border-white/10 h-80">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold text-white">Audits Over Time</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px] flex items-end gap-1 px-4 pb-4">
                        {isLoading ? (
                            <div className="w-full flex items-end gap-1 h-full">
                                {Array(30).fill(0).map((_, i) => <Skeleton key={i} className="flex-1 rounded-t-sm bg-white/10" style={{ height: `\${Math.max(10, Math.random() * 100)}%` }} />)}
                            </div>
                        ) : (
                            analytics?.charts?.audits.map((a: any, i: number) => (
                                <div key={i} className="flex-1 bg-blue-500/50 hover:bg-blue-400 rounded-t-sm transition-all" style={{ height: `\${Math.max(2, (a.count / 5) * 100)}%` }} title={`\${a.date}: \${a.count}`} />
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-bg-secondary border-white/10 h-80">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold text-white">Revenue Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px] flex items-end gap-1 px-4 pb-4 relative">
                        {isLoading ? (
                            <Skeleton className="w-full h-full bg-white/10 rounded-lg" />
                        ) : (
                            <div className="w-full flex items-end gap-1 h-full">
                                {analytics?.charts?.revenue.map((r: any, i: number) => (
                                    <div key={i} className="flex-1 bg-green-500/40 hover:bg-green-400 rounded-t-sm transition-all" style={{ height: `\${Math.max(2, (r.amount / 5000) * 100)}%` }} title={`\${r.date}: $\${r.amount}`} />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-bg-secondary border-white/10 h-64">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold text-white">Top Findings by Category</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-4">
                        {isLoading ? (
                            Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-6 w-full bg-white/10" />)
                        ) : (
                            analytics?.charts?.topFindings.map((f: any, i: number) => (
                                <div key={i} className="space-y-1">
                                    <div className="flex justify-between text-xs font-medium text-white">
                                        <span>{f.category}</span>
                                        <span>{f.count} instances</span>
                                    </div>
                                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                                        <div className="bg-accent-primary h-1.5 rounded-full" style={{ width: `\${(f.count / 142) * 100}%` }} />
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-bg-secondary border-white/10 h-64">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base font-semibold text-white">Proposal Conversion Funnel</CardTitle>
                    </CardHeader>
                    <CardContent className="h-full flex flex-col justify-center px-8 pb-8">
                        {isLoading ? (
                            <Skeleton className="w-full h-24 bg-white/10 rounded-lg" />
                        ) : (
                            <div className="space-y-2">
                                <div className="relative h-10 w-full bg-blue-500/20 rounded-md flex items-center justify-between px-4 mt-2">
                                    <span className="text-sm font-medium text-blue-400">Total Proposals</span>
                                    <span className="text-sm font-bold text-white">{analytics?.overview?.totalProposals || 0}</span>
                                </div>
                                <div className="relative h-10 w-[80%] mx-auto bg-purple-500/20 rounded-md flex items-center justify-between px-4">
                                    <span className="text-sm font-medium text-purple-400">Viewed</span>
                                    <span className="text-sm font-bold text-white">{Math.round((analytics?.overview?.totalProposals || 0) * 0.8)}</span>
                                </div>
                                <div className="relative h-10 w-[60%] mx-auto bg-green-500/20 rounded-md flex items-center justify-between px-4">
                                    <span className="text-sm font-medium text-green-400">Accepted</span>
                                    <span className="text-sm font-bold text-white">{analytics?.overview?.acceptedProposals || 0}</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
