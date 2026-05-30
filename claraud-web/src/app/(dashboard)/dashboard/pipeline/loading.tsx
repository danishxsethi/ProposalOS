import { Skeleton } from '@/components/ui/skeleton';

export default function PipelineLoading() {
  return (
    <div className="p-8 h-full min-h-[calc(100vh-4rem)] flex flex-col space-y-8 animate-in fade-in duration-500">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48 bg-white/5" />
        <Skeleton className="h-5 w-64 bg-white/5" />
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-6 min-w-max h-full">
          {[1, 2, 3, 4, 5].map((col) => (
            <div
              key={col}
              className="w-[350px] bg-bg-card rounded-2xl border border-white/5 flex flex-col p-4 shadow-xl"
            >
              <div className="flex justify-between items-center mb-4">
                <Skeleton className="h-6 w-32 bg-white/10" />
                <Skeleton className="h-6 w-8 bg-white/10 rounded-full" />
              </div>
              <div className="space-y-4 flex-1">
                {[1, 2].map((card) => (
                  <div
                    key={card}
                    className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-4"
                  >
                    <Skeleton className="h-5 w-3/4 bg-white/10" />
                    <Skeleton className="h-4 w-1/2 bg-white/10" />
                    <div className="pt-2 border-t border-white/5 flex justify-end">
                      <Skeleton className="h-8 w-24 bg-white/10 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
