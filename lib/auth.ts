import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { PASSWORD_POLICY } from '@/lib/config/security';

import { authConfig } from './auth.config';

/**
 * Validate password against security policy
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < PASSWORD_POLICY.minLength) {
    return {
      valid: false,
      error: `Password must be at least ${PASSWORD_POLICY.minLength} characters long`,
    };
  }

  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter' };
  }

  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter' };
  }

  if (PASSWORD_POLICY.requireNumbers && !/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number' };
  }

  if (PASSWORD_POLICY.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }

  return { valid: true };
}

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
          .object({ email: z.string().email(), password: z.string().min(PASSWORD_POLICY.minLength) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          
          // Validate password against security policy
          const passwordValidation = validatePassword(password);
          if (!passwordValidation.valid) {
            throw new Error(passwordValidation.error);
          }
          
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
