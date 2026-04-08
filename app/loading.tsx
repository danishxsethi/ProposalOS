export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 animate-pulse">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="h-10 w-64 rounded bg-white/10" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
        <div className="h-[420px] rounded-3xl border border-white/10 bg-white/5" />
      </div>
    </div>
  );
}
