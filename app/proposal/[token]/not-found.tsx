import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-6xl font-bold mb-4">404</h1>
                <h2 className="text-2xl font-semibold mb-4">Proposal Not Found</h2>
                <p className="text-slate-400 mb-8">
                    This proposal link may have expired or doesn't exist.
                </p>
                <Link
                    href="/"
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-medium transition-colors"
                >
                    Go Home
                </Link>
            </div>
        </div>
    );
}
