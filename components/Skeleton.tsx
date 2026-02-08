export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="animate-pulse">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="border-b border-gray-700 py-4">
                    <div className="flex items-center gap-4">
                        <div className="h-4 bg-gray-700 rounded w-1/4"></div>
                        <div className="h-4 bg-gray-700 rounded w-1/6"></div>
                        <div className="h-4 bg-gray-700 rounded w-1/6"></div>
                        <div className="h-4 bg-gray-700 rounded w-1/6"></div>
                        <div className="h-8 bg-gray-700 rounded w-20"></div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function StatsSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <div className="h-4 bg-gray-700 rounded w-2/3 mb-2"></div>
                    <div className="h-8 bg-gray-700 rounded w-1/2"></div>
                </div>
            ))}
        </div>
    );
}
