import { prisma } from '@/lib/prisma';
import { notFound, redirect } from 'next/navigation';

export default async function ClientReviewsPage({ searchParams }: { searchParams: { token?: string } }) {
    const token = searchParams.token;
    if (!token) return redirect('/login');

    // For Demo: Use mocked review responses. In production, fetch these from DB/Audit.
    const reviews = [
        {
            author: "John Doe",
            rating: 5,
            text: "Great service! Highly recommend.",
            response: "Thanks John! We loved working with you on your project."
        },
        {
            author: "Sarah Smith",
            rating: 4,
            text: "Good experience but parking was hard.",
            response: "Hi Sarah, thanks for the feedback! We're actually adding 5 new dedicated spots next week. Hope to see you again!"
        }
    ];

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
                <a href={`/client/dashboard?token=${token}`} className="text-slate-400 hover:text-indigo-600">← Dashboard</a>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Review Assistant</h1>
            <p className="text-slate-500 mb-8">AI-generated responses ready for you to copy and paste.</p>

            <div className="grid gap-6">
                {reviews.map((r, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="font-bold text-slate-900">{r.author}</div>
                                <div className="text-yellow-500">{"★".repeat(r.rating)}</div>
                            </div>
                            <div className="text-xs text-slate-400">2 days ago</div>
                        </div>
                        <p className="text-slate-600 text-sm mb-4 italic">"{r.text}"</p>

                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                            <div className="text-xs font-bold text-indigo-800 uppercase mb-2">Suggested Response</div>
                            <p className="text-indigo-900 text-sm mb-3">{r.response}</p>
                            <button className="text-indigo-600 text-sm font-bold hover:underline">Copy to Clipboard</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
