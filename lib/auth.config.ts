import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
    newUser: '/register',
    error: '/login', // Error page redirects to login
  },
  // Session configuration with secure defaults
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60, // 1 hour session expiry
  },
  // JWT configuration
  jwt: {
    maxAge: 60 * 60, // 1 hour token expiry
  },
  // Security features
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard =
        nextUrl.pathname.startsWith('/dashboard') || nextUrl.pathname.startsWith('/onboarding');
      const isOnAuth =
        nextUrl.pathname.startsWith('/login') || nextUrl.pathname.startsWith('/register');

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login page
      } else if (isLoggedIn && isOnAuth) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
        token.tenantId = (user as unknown as { tenantId: string }).tenantId;
        // Add issued at time for token age verification
        token.iat = Date.now();
      }
      if (trigger === 'update' && session) {
        token = { ...token, ...session.user };
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as unknown as { role: string }).role = token.role as string;
        (session.user as unknown as { tenantId: string }).tenantId = token.tenantId as string;
        // Add token issued time to session for age verification (using type assertion)
        (session.user as unknown as { iat: number }).iat = token.iat as number;
      }
      return session;
    },
  },
  // Security cookies configuration
  cookies: {
    sessionToken: {
      name: `__Host-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'strict', // Enhanced CSRF protection
        path: '/',
        secure: true, // Always use HTTPS
      },
    },
  },
  providers: [], // Configured in auth.ts
} satisfies NextAuthConfig;
