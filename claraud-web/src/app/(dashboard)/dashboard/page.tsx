"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, FileText, PieChart, TrendingUp, Plus } from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboardData";

export default function DashboardHomePage() {
    const { data: session } = useSession();
    const { data, isLoading } = useDashboardStats();

    const statCards = [
        {
            title: "Total Audits",
            value: data?.stats?.totalAudits || 0,
            icon: Activity,
            color: "text-blue-500",
        },
        {
            title: "Active Proposals",
            value: data?.stats?.activeProposals || 0,
            icon: FileText,
            color: "text-purple-500",
        },
        {
            title: "Pipeline Value",
            value: `$${(data?.stats?.pipelineValue || 0).toLocaleString()}`,
            icon: TrendingUp,
            color: "text-green-500",
        },
        {
            title: "Conversion Rate",
            value: `${data?.stats?.conversionRate || 0}%`,
            icon: PieChart,
            color: "text-orange-500",
        }
    ];

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Welcome back, {session?.user?.name || 'User'}
                    </h1>
                    <p className="text-text-secondary mt-1">
                        Here's what's happening today, {format(new Date(), "MMMM do, yyyy")}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button asChild variant="outline" className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                        <Link href="/dashboard/pipeline">View Pipeline</Link>
                    </Button>
                    <Button asChild className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold shadow-lg shadow-accent-primary/20">
                        <Link href="/scan">
                            <Plus className="mr-2 h-4 w-4" /> Run New Audit
                        </Link>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((stat, i) => (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.1 }}
                    >
                        <Card className="bg-bg-secondary border-white/10 overflow-hidden relative">
                            <div className={`absolute top-0 right-0 p-4 opacity-10 ${stat.color}`}>
                                <stat.icon className="w-16 h-16" />
                            </div>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-text-secondary">
                                    {stat.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {isLoading ? (
                                    <Skeleton className="h-8 w-24 bg-white/10" />
                                ) : (
                                    <div className="text-3xl font-bold text-white">{stat.value}</div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="col-span-1 lg:col-span-2 bg-bg-secondary border-white/10">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-white">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-4">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-16 w-full bg-white/10 rounded-lg" />
                                ))}
                            </div>
                        ) : data?.recentActivity?.length > 0 ? (
                            <div className="space-y-4">
                                {data.recentActivity.map((activity: any, i: number) => (
                                    <motion.div
                                        key={activity.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.3, delay: i * 0.1 }}
                                        className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 rounded-full bg-blue-500/20 text-blue-400">
                                                <Activity className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{activity.title}</p>
                                                <p className="text-xs text-text-secondary">{format(new Date(activity.date), "MMM d, h:mm a")}</p>
                                            </div>
                                        </div>
                                        {activity.score !== null && (
                                            <div className="font-semibold text-white">{activity.score}/100</div>
                                        )}
                                    </motion.div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-text-secondary">
                                No recent activity found. Run your first audit to get started!
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}