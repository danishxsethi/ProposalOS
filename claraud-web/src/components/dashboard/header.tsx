export function DashboardHeader({ user }: { user: any }) {
  return (
    <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-bg-primary">
      <div className="font-semibold text-white">Dashboard</div>
      <div className="flex items-center gap-4 text-sm text-text-secondary">
        {user?.email || 'User'}
      </div>
    </header>
  );
}
