"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChevronRight, DollarSign } from "lucide-react";

const PIPELINE_STAGES = [
    { id: "DRAFT", label: "Scanned / Draft", color: "border-gray-500/30" },
    { id: "SENT", label: "Proposed", color: "border-blue-500/30" },
    { id: "VIEWED", label: "Viewed", color: "border-purple-500/30" },
    { id: "ACCEPTED", label: "Won / Accepted", color: "border-green-500/30" },
    { id: "REJECTED", label: "Lost / Rejected", color: "border-red-500/30" }
];

export default function PipelinePage() {
    const queryClient = useQueryClient();

    const { data: proposals, isLoading } = useQuery({
        queryKey: ['proposals', 'ALL', 'ALL'],
        queryFn: async () => {
            const res = await fetch(`/api/proposals?search=&status=ALL`);
            if (!res.ok) throw new Error('Failed to fetch proposals');
            const data = await res.json();
            return data.proposals || [];
        },
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            const res = await fetch('/api/proposals', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status })
            });
            if (!res.ok) throw new Error('Failed to update status');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['proposals'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        }
    });

    const moveProposal = (proposalId: string, currentStage: string) => {
        const currentIndex = PIPELINE_STAGES.findIndex(s => s.id === currentStage);
        if (currentIndex >= 0 && currentIndex < PIPELINE_STAGES.length - 1) {
            updateStatusMutation.mutate({ id: proposalId, status: PIPELINE_STAGES[currentIndex + 1].id });
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Pipeline</h1>
                    <p className="text-text-secondary mt-1">Manage your active deals and proposals.</p>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-200px)]">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="min-w-[300px] w-[300px] flex-shrink-0 bg-white/5 rounded-xl border border-white/10 p-4">
                            <Skeleton className="h-6 w-32 bg-white/10 mb-4" />
                            <div className="space-y-3">
                                <Skeleton className="h-24 w-full bg-white/10 rounded-lg" />
                                <Skeleton className="h-24 w-full bg-white/10 rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Pipeline</h1>
                <p className="text-text-secondary mt-1">Manage your active deals and proposals.</p>
            </div>

            <div className="flex-1 flex gap-4 overflow-x-auto pb-4 snap-x">
                {PIPELINE_STAGES.map((stage) => {
                    // DECLINED maps to LOST visually for this pipeline
                    const stageProposals = proposals?.filter((p: any) =>
                        p.status === stage.id || (stage.id === 'LOST' && p.status === 'DECLINED')
                    ) || [];
                    const stageValue = stageProposals.reduce((sum: number, p: any) => sum + p.dealValue, 0);

                    return (
                        <div key={stage.id} className="min-w-[320px] w-[320px] max-w-[320px] flex-shrink-0 flex flex-col snap-start">
                            <div className={`rounded-xl border ${stage.color} bg-bg-secondary h-full flex flex-col overflow-hidden`}>
                                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                    <h3 className="font-semibold text-white">{stage.label} <span className="text-text-secondary font-normal ml-1">({stageProposals.length})</span></h3>
                                    <div className="text-sm font-medium text-text-secondary flex items-center">
                                        <DollarSign className="w-3 h-3 mr-0.5" />{stageValue.toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                    <AnimatePresence>
                                        {stageProposals.map((proposal: any) => (
                                            <motion.div
                                                key={proposal.id}
                                                layout
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <Card className="bg-bg-primary border-white/10 hover:border-white/20 transition-colors shadow-none">
                                                    <CardContent className="p-4 space-y-3">
                                                        <div>
                                                            <div className="font-medium text-white line-clamp-1" title={proposal.businessName}>
                                                                {proposal.businessName}
                                                            </div>
                                                            <div className="text-xs text-text-secondary mt-1 flex justify-between">
                                                                <span>{format(new Date(proposal.createdAt), "MMM d, yyyy")}</span>
                                                                <span className="text-green-400 font-medium">${proposal.dealValue.toLocaleString()}</span>
                                                            </div>
                                                        </div>

                                                        {stage.id !== 'ACCEPTED' && stage.id !== 'REJECTED' && (
                                                            <div className="pt-2 border-t border-white/5 flex justify-end">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-7 text-xs bg-white/5 hover:bg-white/10 text-white"
                                                                    onClick={() => moveProposal(proposal.id, stage.id)}
                                                                    disabled={updateStatusMutation.isPending}
                                                                >
                                                                    Move Forward <ChevronRight className="ml-1 h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </CardContent>
                                                </Card>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {stageProposals.length === 0 && (
                                        <div className="text-center py-6 text-sm text-white/20 border border-dashed border-white/10 rounded-lg">
                                            No proposals in this stage
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
