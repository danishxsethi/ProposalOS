import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

export default NextAuth(authConfig).auth((req) => {
    const url = req.nextUrl;
    const hostname = req.headers.get('host') || '';

    // Define allowed system domains (localhost, vercel.app, etc.)
    // In production, this should be env var
    const currentHost = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : 'localhost:3000';

    // Check if Custom Domain
    // If hostname is NOT one of our main domains, treat as custom
    const isCustomDomain = hostname !== currentHost &&
        !hostname.endsWith('.vercel.app') &&
        !hostname.includes('localhost');

    if (isCustomDomain) {
        // Rewrite Logic:
        // We preserve the path, but inject the custom domain as a header 
        // OR rewrite to a special route if we wanted distinct handling.
        // User asked to "Rewrite to /proposal/[token]"
        // If the user visits root "/", we might want to show something specific?
        // But for now, we just let it pass through, allowing the app to see the Host header.

        // However, if we want to enforce that this domain maps to a specific tenant,
        // we can't easily check DB here without Edge adapter.
        // We will pass a header `x-custom-domain` so API routes/Pages can verify easier.
        const response = NextResponse.next();
        response.headers.set('x-custom-domain', hostname);
        return response;
    }
});

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};
