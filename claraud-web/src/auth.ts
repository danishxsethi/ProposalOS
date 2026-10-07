import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { z } from 'zod';

import { authConfig } from '@/lib/auth/auth.config';
import { prisma, withSystemBypass } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // ponytail: `as any` here works around a real, pre-existing, unrelated type conflict --
  // claraud-web's node_modules has two separate copies of @auth/core (one direct, one
  // nested under next-auth), each with a structurally slightly different `Adapter`/
  // `AdapterUser` type, which TypeScript treats as distinct types. Fixing properly means
  // deduping the @auth/core dependency tree, not a change this session's tenant-scoping
  // fix should make. Ceiling: PrismaAdapter's return type; upgrade path: resolve the
  // duplicate @auth/core install (npm dedupe / pin one version) in a dependency-hygiene pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma) as any,
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
          // Tenant is not known yet -- looking up the user by email is how it's
          // discovered -- so this must run as an explicit system bypass.
          const user = await withSystemBypass('credentials sign-in: tenant not yet known', () =>
            prisma.user.findUnique({ where: { email } })
          );
          if (!user || !user.passwordHash) return null;

          const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
          if (passwordsMatch) {
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

// Re-export authOptions for backward compatibility with API routes if needed
export const authOptions = authConfig;

export async function getServerSession() {
  const session = await auth();
  return session;
}
