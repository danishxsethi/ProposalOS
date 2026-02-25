import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: PrismaAdapter(prisma),
    session: { strategy: 'jwt' },
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
        }),
        Credentials({
            async authorize(credentials) {
                const parsedCredentials = z
                    .object({ email: z.string().email(), password: z.string().min(6) })
                    .safeParse(credentials);

                if (parsedCredentials.success) {
                    const { email, password } = parsedCredentials.data;
                    const user = await prisma.user.findUnique({ where: { email } });
                    if (!user || !user.passwordHash) return null;

                    const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
                    if (passwordsMatch) {
                        // Convert null to undefined for NextAuth compatibility
                        return {
                            ...user,
                            tenantId: user.tenantId ?? undefined,
                        };
                    }
                }

                return null;
            },
        }),
    ],
});

// Re-export authOptions for backward compatibility with API routes
export const authOptions = authConfig;

// Backward compatible getServerSession using NextAuth v5 auth()
import { headers } from 'next/headers';
export async function getServerSession() {
    const session = await auth();
    return session;
}
