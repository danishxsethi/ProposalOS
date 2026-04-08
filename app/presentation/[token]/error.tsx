'use client';

export default function PresentationError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-2 text-sm uppercase tracking-[0.2em] text-red-300">Presentation Error</p>
        <h2 className="mb-3 text-3xl font-bold">The presentation couldn&apos;t be rendered</h2>
        <p className="mb-6 text-white/70">Please retry or open the PDF instead.</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500"
          >
            Retry presentation
          </button>
          <a
            href="/"
            className="rounded-lg border border-white/15 px-5 py-3 font-semibold hover:bg-white/10"
          >
            Exit
          </a>
        </div>
      </div>
    </div>
  );
}
