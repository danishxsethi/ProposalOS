/**
 * Audit Loading Skeletons
 *
 * Provides skeleton loaders for audit-related UI components.
 * Used during initial page load and data fetching states.
 */

export function AuditProgressSkeleton() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="text-center space-y-2">
        <div className="h-8 w-64 bg-white/10 rounded-lg mx-auto" />
        <div className="h-4 w-96 bg-white/5 rounded mx-auto" />
      </div>

      {/* Overall Progress Skeleton */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-white/10 rounded" />
          <div className="h-4 w-12 bg-white/10 rounded" />
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full" />
        <div className="flex items-center justify-between">
          <div className="h-3 w-40 bg-white/5 rounded" />
          <div className="h-3 w-24 bg-white/5 rounded" />
        </div>
      </div>

      {/* Current Activity Skeleton */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-blue-500/20 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 bg-blue-500/20 rounded" />
          <div className="h-3 w-64 bg-blue-500/10 rounded" />
        </div>
        <div className="h-4 w-12 bg-blue-500/20 rounded" />
      </div>

      {/* Module List Skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="border border-white/10 rounded-xl p-4 bg-white/5 flex items-center gap-4"
          >
            <div className="w-8 h-8 bg-white/10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-white/10 rounded" />
              <div className="h-3 w-48 bg-white/5 rounded" />
            </div>
            <div className="h-3 w-16 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Summary Stats Skeleton */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-2">
            <div className="h-8 w-12 bg-white/10 rounded mx-auto" />
            <div className="h-3 w-20 bg-white/5 rounded mx-auto" />
          </div>
          <div className="space-y-2">
            <div className="h-8 w-12 bg-white/10 rounded mx-auto" />
            <div className="h-3 w-20 bg-white/5 rounded mx-auto" />
          </div>
          <div className="space-y-2">
            <div className="h-8 w-12 bg-white/10 rounded mx-auto" />
            <div className="h-3 w-20 bg-white/5 rounded mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary pb-24 selection:bg-blue-500/30 overflow-x-hidden">
      {/* Background decoration (kept visible) */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 pt-12 relative z-10 space-y-12 animate-pulse">
        {/* Header Skeleton */}
        <section className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-10 w-64 bg-white/10 rounded-lg" />
              <div className="h-4 w-48 bg-white/5 rounded" />
            </div>
            <div className="w-24 h-24 bg-white/5 rounded-full" />
          </div>
        </section>

        {/* Score Overview Skeleton */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="h-6 w-40 bg-white/10 rounded mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 bg-white/10 rounded" />
                <div className="h-12 w-full bg-white/5 rounded" />
                <div className="h-3 w-16 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        </section>

        {/* Findings Skeleton */}
        <section className="space-y-4">
          <div className="h-8 w-48 bg-white/10 rounded" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border border-white/10 rounded-2xl p-6 bg-white/5">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-white/10 rounded" />
                <div className="h-4 w-64 bg-white/10 rounded flex-1" />
                <div className="h-6 w-20 bg-white/5 rounded" />
              </div>
            </div>
          ))}
        </section>

        {/* Competitor Table Skeleton */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-8">
          <div className="h-6 w-40 bg-white/10 rounded mb-6" />
          <div className="overflow-x-auto">
            <div className="min-w-full divide-y divide-white/10">
              <div className="flex gap-4 pb-4">
                <div className="h-4 w-32 bg-white/10 rounded" />
                <div className="h-4 w-20 bg-white/5 rounded" />
                <div className="h-4 w-20 bg-white/5 rounded" />
                <div className="h-4 w-20 bg-white/5 rounded" />
              </div>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex gap-4 py-4 border-t border-white/5">
                  <div className="h-4 w-32 bg-white/5 rounded" />
                  <div className="h-4 w-20 bg-white/5 rounded" />
                  <div className="h-4 w-20 bg-white/5 rounded" />
                  <div className="h-4 w-20 bg-white/5 rounded" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Skeleton */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
          <div className="h-8 w-64 bg-white/10 rounded mx-auto mb-4" />
          <div className="h-4 w-96 bg-white/5 rounded mx-auto mb-6" />
          <div className="flex gap-4 justify-center">
            <div className="h-10 w-32 bg-white/10 rounded-lg" />
            <div className="h-10 w-32 bg-white/5 rounded-lg border border-white/10" />
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProposalSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-bg-primary to-bg-secondary animate-pulse">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 bg-white/10 rounded" />
            <div className="h-4 w-64 bg-white/5 rounded" />
          </div>
          <div className="w-16 h-16 bg-white/5 rounded-full" />
        </div>

        {/* Executive Summary */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="h-6 w-40 bg-white/10 rounded" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-white/5 rounded" />
            <div className="h-4 w-full bg-white/5 rounded" />
            <div className="h-4 w-3/4 bg-white/5 rounded" />
          </div>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-white/10 rounded-2xl p-6 space-y-4 bg-white/5">
              <div className="h-6 w-24 bg-white/10 rounded" />
              <div className="h-12 w-full bg-white/5 rounded" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-white/5 rounded" />
                <div className="h-3 w-full bg-white/5 rounded" />
                <div className="h-3 w-2/3 bg-white/5 rounded" />
              </div>
              <div className="h-10 w-full bg-white/10 rounded-lg" />
            </div>
          ))}
        </div>

        {/* Findings Preview */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="h-6 w-32 bg-white/10 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 bg-white/5 rounded" />
              <div className="h-4 w-48 bg-white/5 rounded flex-1" />
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center pt-8">
          <div className="h-12 w-40 bg-white/10 rounded-xl" />
          <div className="h-12 w-40 bg-white/5 rounded-xl border border-white/10" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-bg-primary animate-pulse">
      {/* Top Bar Skeleton */}
      <div className="border-b border-white/10 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="h-8 w-32 bg-white/10 rounded" />
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-white/5 rounded-full" />
            <div className="w-24 h-8 bg-white/5 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <div className="h-3 w-20 bg-white/5 rounded" />
              <div className="h-8 w-full bg-white/10 rounded" />
              <div className="h-3 w-24 bg-white/5 rounded" />
            </div>
          ))}
        </div>

        {/* Chart Area */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="h-6 w-32 bg-white/10 rounded mb-4" />
          <div className="h-64 w-full bg-white/5 rounded" />
        </div>

        {/* Recent Audits Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <div className="h-6 w-40 bg-white/10 rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-4 bg-white/5 rounded" />
                <div className="h-4 w-48 bg-white/5 rounded flex-1" />
                <div className="h-4 w-20 bg-white/5 rounded" />
                <div className="h-4 w-24 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
