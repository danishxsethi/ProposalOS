import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';

export default async function ClientLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: any;
}) {
    // For MVP, we presume the page component handles the specific token/auth verification
    // because layouts don't easily access query params in server components (in Next 14).
    // Access validation will happen in the page.

    // However, we can wrap this in a nice branded container.
    return (
        <div className="min-h-screen bg-white text-slate-800 font-sans">
            {/* Header would be dynamic based on tenant, passed from Page context? 
                 In Server Components, layouts can't read searchParams. 
                 So we'll keep the layout generic and let pages hydrate the header. 
             */}
            <div className="bg-slate-50 border-b border-slate-200">
                <div className="container mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="font-bold text-slate-800 text-lg">Client<span className="text-indigo-600">Portal</span></div>
                    <div className="text-xs text-slate-500">Secure Access</div>
                </div>
            </div>

            <main className="container mx-auto px-6 py-8">
                {children}
            </main>

            <footer className="border-t border-slate-100 py-8 text-center text-slate-400 text-sm">
                <p>&copy; {new Date().getFullYear()} All Rights Reserved.</p>
            </footer>
        </div>
    );
}
