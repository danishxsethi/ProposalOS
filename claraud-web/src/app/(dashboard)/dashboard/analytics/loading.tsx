import { Skeleton } from '@/components/ui/skeleton';

export default function AnalyticsLoading() {
  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48 bg-white/5" />
        <Skeleton className="h-5 w-64 bg-white/5" />
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

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-bg-card border border-white/5 p-6 rounded-2xl h-[400px] flex flex-col">
          <Skeleton className="h-6 w-48 bg-white/10 mb-8" />
          <Skeleton className="flex-1 w-full bg-white/5 rounded-xl" />
        </div>
        <div className="bg-bg-card border border-white/5 p-6 rounded-2xl h-[400px] flex flex-col">
          <Skeleton className="h-6 w-48 bg-white/10 mb-8" />
          <Skeleton className="flex-1 w-full bg-white/5 rounded-full aspect-square max-w-[250px] mx-auto" />
        </div>
      </div>
    </div>
  );
}
