export default function AuditDetailLoading() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 animate-pulse">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="h-6 w-40 rounded bg-white/10" />
        <div className="h-10 w-72 rounded bg-white/10" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, column) => (
            <div key={column} className="space-y-3">
              <div className="h-6 w-40 rounded bg-white/10" />
              {Array.from({ length: 4 }).map((__, idx) => (
                <div key={idx} className="h-24 rounded-2xl border border-white/10 bg-white/5" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
