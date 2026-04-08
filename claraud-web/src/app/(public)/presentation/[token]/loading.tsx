import { Loader2 } from "lucide-react";

export default function PresentationLoading() {
    return (
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-blue-500/20 blur-[100px] rounded-full" />
                <div className="relative bg-white/5 p-8 rounded-full border border-white/10 animate-pulse">
                    <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                </div>
            </div>
            <p className="mt-8 text-white/50 animate-pulse tracking-widest uppercase text-xs font-bold">
                Initializing Slide Deck...
            </p>
        </div>
    );
}
