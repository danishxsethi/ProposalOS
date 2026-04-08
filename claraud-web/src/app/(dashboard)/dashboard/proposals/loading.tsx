import { Skeleton } from "@/components/ui/skeleton";

export default function ProposalsLoading() {
    return (
        <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-48 bg-white/5" />
                    <Skeleton className="h-5 w-64 bg-white/5" />
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                    <Skeleton className="h-12 w-32 bg-white/5 rounded-lg" />
                    <Skeleton className="h-12 w-64 bg-white/5 rounded-full" />
                </div>
            </div>

            <div className="bg-bg-card border border-white/5 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-5 bg-white/5 p-4 border-b border-white/5">
                    <Skeleton className="h-4 w-32 bg-white/10" />
                    <Skeleton className="h-4 w-24 bg-white/10" />
                    <Skeleton className="h-4 w-24 bg-white/10" />
                    <Skeleton className="h-4 w-24 bg-white/10" />
                    <Skeleton className="h-4 w-24 bg-white/10" />
                </div>
                <div className="divide-y divide-white/5">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="grid grid-cols-5 p-4 items-center gap-4">
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-32 bg-white/10" />
                                <Skeleton className="h-4 w-48 bg-white/5" />
                            </div>
                            <Skeleton className="h-6 w-16 bg-white/10 rounded-full" />
                            <Skeleton className="h-4 w-16 bg-white/10" />
                            <Skeleton className="h-4 w-24 bg-white/10" />
                            <div className="flex gap-2 justify-end">
                                <Skeleton className="h-8 w-8 bg-white/10 rounded-md" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
