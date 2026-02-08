export default function TrialBanner() {
    return (
        <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-b border-blue-500/20 px-4 py-2">
            <div className="container mx-auto flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                    <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded">TRIAL</span>
                    <span className="text-blue-200">
                        You have <span className="font-bold text-white">14 days</span> left in your Pro trial.
                    </span>
                </div>
                <a href="/settings/billing" className="text-blue-300 hover:text-white transition-colors text-xs font-semibold">
                    Upgrade Now →
                </a>
            </div>
        </div>
    );
}
