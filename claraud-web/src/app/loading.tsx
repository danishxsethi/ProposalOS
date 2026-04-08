import { SectionWrapper } from '@/components/shared/section-wrapper';

export default function Loading() {
    return (
        <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center pt-20">
            <div className="w-full max-w-2xl px-4 space-y-8 animate-pulse">
                {/* Header Skeleton */}
                <div className="space-y-4">
                    <div className="h-10 w-2/3 bg-gradient-to-r from-white/10 to-transparent rounded-lg"></div>
                    <div className="h-4 w-1/3 bg-white/5 rounded"></div>
                </div>

                {/* Content Blocks Skeleton */}
                <div className="space-y-6">
                    <div className="h-32 w-full bg-white/5 rounded-2xl border border-white/10"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="h-48 bg-white/5 rounded-2xl border border-white/10"></div>
                        <div className="h-48 bg-white/5 rounded-2xl border border-white/10"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
