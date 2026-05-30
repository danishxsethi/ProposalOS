'use client';

export default function DashboardRouteError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-red-300">Dashboard Error</p>
        <h2 className="mb-3 text-3xl font-bold">The dashboard failed to load</h2>
        <p className="mb-6 text-white/70">Retry to recover your workspace data.</p>
        <button
          onClick={() => reset()}
          className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
        >
          Retry dashboard
        </button>
      </div>
    </div>
  );
}
