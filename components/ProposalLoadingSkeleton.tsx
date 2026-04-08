'use client';

export default function ProposalLoadingSkeleton() {
  return (
    <main className="min-h-screen text-white" style={{ backgroundColor: '#1a1a2e' }}>
      {/* Header Skeleton */}
      <div className="sticky top-0 z-40 bg-[#1a1a2e]/95 backdrop-blur-md">
        <header className="border-b border-white/10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
            <div className="h-6 w-32 bg-white/20 rounded animate-pulse"></div>
            <div className="h-10 w-24 bg-blue-500/50 rounded animate-pulse"></div>
          </div>
        </header>
        <nav className="border-b border-white/5 py-3 px-4">
          <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-2 sm:gap-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-8 w-20 bg-white/10 rounded animate-pulse"></div>
            ))}
          </div>
        </nav>
      </div>

      {/* Hero Section Skeleton */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="h-12 w-96 mx-auto bg-white/20 rounded animate-pulse mb-4"></div>
          <div className="h-6 w-64 mx-auto bg-white/10 rounded animate-pulse mb-8"></div>
          <div className="flex justify-center">
            <div className="w-48 h-48 sm:w-56 sm:h-56 bg-white/10 rounded-full animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Executive Summary Skeleton */}
      <section className="py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-64 bg-white/20 rounded animate-pulse mb-6"></div>
          <div className="space-y-4">
            <div className="h-4 w-full bg-white/10 rounded animate-pulse"></div>
            <div className="h-4 w-5/6 bg-white/10 rounded animate-pulse"></div>
            <div className="h-4 w-4/6 bg-white/10 rounded animate-pulse"></div>
          </div>
        </div>
      </section>

      {/* Scores Section Skeleton */}
      <section className="py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-48 bg-white/20 rounded animate-pulse mb-8"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-32 h-32 sm:w-40 sm:h-40 bg-white/10 rounded-full animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Findings Section Skeleton */}
      <section className="py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-32 bg-white/20 rounded animate-pulse mb-8"></div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden animate-pulse"
              >
                <div className="w-full px-4 sm:px-6 py-4 flex items-center justify-between gap-4 min-h-[44px]">
                  <div className="h-4 w-3/4 bg-white/10 rounded"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section Skeleton */}
      <section className="py-12 sm:py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-48 bg-white/20 rounded animate-pulse mb-8 text-center"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl p-6 sm:p-8 border border-white/10 bg-white/5 animate-pulse"
              >
                <div className="h-6 w-24 bg-white/10 rounded mb-4"></div>
                <div className="h-8 w-16 bg-white/10 rounded mb-4"></div>
                <div className="h-4 w-full bg-white/10 rounded mb-4"></div>
                <div className="h-12 w-full bg-green-500/30 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section Skeleton */}
      <section
        className="py-16 sm:py-24 px-4 sm:px-6"
        style={{ background: 'linear-gradient(180deg, transparent, #4361ee15)' }}
      >
        <div className="max-w-2xl mx-auto text-center">
          <div className="h-8 w-64 mx-auto bg-white/20 rounded animate-pulse mb-4"></div>
          <div className="h-4 w-80 mx-auto bg-white/10 rounded animate-pulse mb-8"></div>
          <div className="h-14 w-64 mx-auto bg-green-500/50 rounded animate-pulse"></div>
        </div>
      </section>

      {/* Footer Skeleton */}
      <footer className="py-8 px-4 border-t border-white/10">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <div className="h-4 w-96 mx-auto bg-white/10 rounded animate-pulse"></div>
        </div>
      </footer>
    </main>
  );
}
