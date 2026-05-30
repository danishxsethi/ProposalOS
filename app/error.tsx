'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <p className="mb-3 text-sm uppercase tracking-[0.2em] text-red-300">Application Error</p>
          <h1 className="mb-4 text-3xl font-bold">Something went wrong</h1>
          <p className="mb-6 text-white/70">
            We hit an unexpected error while rendering this page. You can retry safely.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={() => reset()}
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500"
            >
              Try again
            </button>
            <a
              href="/"
              className="rounded-lg border border-white/15 px-5 py-3 font-semibold text-white/90 transition hover:bg-white/10"
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
