'use client';

export default function ProposalRouteError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e] p-4 text-white">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-amber-300">
          Proposal unavailable
        </p>
        <h2 className="mb-3 text-3xl font-bold">We couldn&apos;t load this proposal</h2>
        <p className="mb-6 text-white/70">
          Please retry. If this keeps happening, the share link may have expired.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-[#4361ee] px-5 py-3 font-semibold text-white hover:bg-[#3b52d4]"
          >
            Retry proposal
          </button>
          <a
            href="/"
            className="rounded-lg border border-white/15 px-5 py-3 font-semibold text-white/90 hover:bg-white/10"
          >
            Back home
          </a>
        </div>
      </div>
    </div>
  );
}
