export default function PresentationLoading() {
  return (
    <div className="min-h-screen bg-[#0f172a] p-8 animate-pulse">
      <div className="flex h-[calc(100vh-4rem)] flex-col justify-between rounded-3xl border border-white/10 bg-white/5 p-10">
        <div className="space-y-6">
          <div className="h-8 w-48 rounded bg-white/10" />
          <div className="h-20 w-3/4 rounded bg-white/10" />
          <div className="h-6 w-1/2 rounded bg-white/10" />
        </div>
        <div className="h-2 w-full rounded bg-white/10" />
      </div>
    </div>
  );
}
