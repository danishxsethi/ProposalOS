import { Skeleton } from "@/components/ui/skeleton";

export default function ProposalLoading() {
    return (
        <div className="min-h-screen bg-bg-primary pt-12 pb-24 px-4">
            <div className="max-w-6xl mx-auto space-y-32">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8">
                    <div className="space-y-4 flex-1">
                        <Skeleton className="h-12 w-3/4 max-w-md bg-white/10" />
                        <Skeleton className="h-6 w-1/2 max-w-sm bg-white/5" />
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-center space-y-2">
                            <Skeleton className="h-24 w-24 rounded-lg bg-white/10 mx-auto" />
                            <Skeleton className="h-3 w-20 bg-white/5 mx-auto" />
                        </div>
                        <Skeleton className="h-16 w-16 rounded-xl bg-white/10" />
                    </div>
                </div>

                {/* Score Overview grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="bg-white/5 rounded-2xl p-6 text-center space-y-4">
                            <Skeleton className="h-10 w-10 rounded-full mx-auto bg-white/10" />
                            <Skeleton className="h-8 w-16 mx-auto bg-white/10" />
                            <Skeleton className="h-4 w-20 mx-auto bg-white/5" />
                        </div>
                    ))}
                </div>

                {/* Findings List */}
                <div className="space-y-6">
                    <Skeleton className="h-8 w-64 bg-white/10" />
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-white/5 rounded-2xl p-8 flex gap-6">
                            <Skeleton className="h-12 w-12 rounded-xl bg-red-500/20 shrink-0" />
                            <div className="space-y-4 flex-1">
                                <Skeleton className="h-6 w-1/3 bg-white/10" />
                                <Skeleton className="h-4 w-full bg-white/5" />
                                <Skeleton className="h-4 w-5/6 bg-white/5" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
