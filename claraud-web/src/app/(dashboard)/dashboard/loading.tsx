import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-64 bg-white/5" />
        <Skeleton className="h-5 w-96 bg-white/5" />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-bg-card border border-white/5 p-6 rounded-2xl flex flex-col gap-4"
          >
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-24 bg-white/10" />
              <Skeleton className="h-8 w-8 rounded-full bg-white/10" />
            </div>
            <Skeleton className="h-10 w-32 bg-white/10" />
          </div>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="bg-bg-card border border-white/5 p-6 rounded-2xl space-y-6">
        <Skeleton className="h-6 w-48 bg-white/10" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4 bg-white/10" />
                <Skeleton className="h-3 w-1/4 bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
