export function ScanInput({ variant = 'large' }: { variant?: 'large' | 'compact' }) {
  const spacing = variant === 'large' ? 'p-6' : 'p-4';

  return (
    <div
      role="status"
      className={`mx-auto w-full max-w-2xl rounded-2xl border border-amber-400/20 bg-amber-400/5 ${spacing} text-center`}
    >
      <h2 className="mb-2 font-semibold text-white">Public self-service scans are paused</h2>
      <p className="text-sm text-text-secondary">
        This page does not collect a URL or start an audit. Intake can reopen after usage limits and
        browser network safeguards are reviewed.
      </p>
    </div>
  );
}
