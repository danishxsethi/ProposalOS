import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Validate environment on server startup
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
    const { validateEnv } = require('@/lib/config/validateEnv');
    validateEnv();
}


const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
});

export const metadata: Metadata = {
    title: "ProposalOS | Automated Local Business Audits",
    description: "Generate data-driven proposals for local businesses in minutes, not hours.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={inter.variable}>
            <body className="antialiased">{children}</body>
        </html>
    );
}

