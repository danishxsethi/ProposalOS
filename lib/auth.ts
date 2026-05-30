import crypto from 'crypto';

import { headers } from 'next/headers';

import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { z } from 'zod';

import { runWithAuthAdapterContext } from '@/lib/auth/adapterContext';
import { buildWrappedPrismaAdapter } from '@/lib/auth/wrappedPrismaAdapter';
import { PASSWORD_POLICY } from '@/lib/config/security';
import { logger } from '@/lib/logger';
import { recordAuditTrailEvent } from '@/lib/observability/auditTrail';
import { prisma } from '@/lib/prisma';

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

  if (
    PASSWORD_POLICY.requireSpecialChars &&
    !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
  ) {
    return { valid: false, error: 'Password must contain at least one special character' };
  }

  return { valid: true };
}

/**
 * Generate privacy-safe prefix and return SHA-256 hash of the IP address.
 */
function getIpHash(ip: string | null): string | null {
  if (!ip) return null;

  // Keep first 3 octets for IPv4, or first 3 blocks for IPv6 to be privacy-safe
  const firstPart = ip.split(',')[0];
  if (!firstPart) return null;
  let cleanIp = firstPart.trim();

  if (cleanIp.includes('.')) {
    // IPv4
    const parts = cleanIp.split('.');
    if (parts.length >= 3) {
      cleanIp = parts.slice(0, 3).join('.') + '.0';
    }
  } else if (cleanIp.includes(':')) {
    // IPv6
    const parts = cleanIp.split(':');
    if (parts.length >= 3) {
      cleanIp = parts.slice(0, 3).join(':') + '::';
    }
  }

  return crypto.createHash('sha256').update(cleanIp).digest('hex');
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: buildWrappedPrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  callbacks: {
    ...(authConfig.callbacks || {}),
    async jwt({ token, user, trigger, session }) {
      // 1. Run the base jwt callback to populate standard token fields
      const baseJwt = authConfig.callbacks?.jwt;
      const mergedToken = baseJwt ? await baseJwt({ token, user, trigger, session }) : token;

      // If the merged token is null or falsy, return it immediately
      if (!mergedToken) return null;

      // 2. Ensure we have a JTI (session token identifier)
      if (!mergedToken.jti) {
        mergedToken.jti = crypto.randomUUID();
      }

      const jti = mergedToken.jti as string;

      // 3. Handle session database tracking and revocation
      if (user) {
        // Initial sign-in: track session record in the database
        let userAgentHash: string | null = null;
        let ipHash: string | null = null;

        try {
          const reqHeaders = await headers();
          const userAgent = reqHeaders.get('user-agent');
          if (userAgent) {
            userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex');
          }
          const xForwardedFor = reqHeaders.get('x-forwarded-for') || reqHeaders.get('x-real-ip');
          if (xForwardedFor) {
            ipHash = getIpHash(xForwardedFor);
          }
        } catch (e) {
          logger.warn('Headers not available during session creation');
        }

        // Set session expiry (e.g., matching the 1-hour JWT token maxAge policy)
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await runWithAuthAdapterContext({ operation: 'session.create', models: ['Session'] }, () =>
          prisma.session.create({
            data: {
              sessionToken: jti,
              userId: user.id as string,
              expires: expiresAt,
              userAgentHash,
              ipHash,
            },
          })
        );

        // Emit session.created event
        await recordAuditTrailEvent({
          eventType: 'session.created',
          tenantId: (user as any).tenantId ?? null,
          actorId: user.id as string,
          payload: {
            jti,
            userAgentHash,
            ipHash,
          },
        }).catch(() => {});
      } else {
        // Subsequent verification requests: validate session record in DB
        const sessionRecord = await runWithAuthAdapterContext(
          { operation: 'session.findAndValidate', models: ['Session', 'User'] },
          () =>
            prisma.session.findUnique({
              where: { sessionToken: jti },
              include: { user: true },
            })
        );

        if (!sessionRecord) {
          logger.warn({ jti }, 'Session record not found in database');
          await recordAuditTrailEvent({
            eventType: 'session.blocked',
            tenantId: null,
            payload: { jti, reason: 'session_record_not_found' },
          }).catch(() => {});
          return null; // Deny session
        }

        if (sessionRecord.revokedAt) {
          logger.warn(
            { jti, revokedAt: sessionRecord.revokedAt, reason: sessionRecord.revokeReason },
            'Attempted use of revoked session'
          );
          await recordAuditTrailEvent({
            eventType: 'session.blocked',
            tenantId: sessionRecord.user?.tenantId ?? null,
            actorId: sessionRecord.userId,
            payload: { jti, reason: 'session_revoked', revokeReason: sessionRecord.revokeReason },
          }).catch(() => {});
          return null; // Deny session
        }

        if (sessionRecord.expires < new Date()) {
          logger.warn({ jti, expires: sessionRecord.expires }, 'Attempted use of expired session');
          await recordAuditTrailEvent({
            eventType: 'session.blocked',
            tenantId: sessionRecord.user?.tenantId ?? null,
            actorId: sessionRecord.userId,
            payload: { jti, reason: 'session_expired', expiresAt: sessionRecord.expires },
          }).catch(() => {});
          return null; // Deny session
        }

        if (!sessionRecord.user) {
          logger.warn({ jti }, 'User associated with session not found');
          await recordAuditTrailEvent({
            eventType: 'session.blocked',
            tenantId: null,
            payload: { jti, reason: 'user_not_found' },
          }).catch(() => {});
          return null; // Deny session
        }

        // Update lastSeenAt in the background asynchronously to avoid blocking the critical path
        runWithAuthAdapterContext(
          { operation: 'session.updateLastSeen', models: ['Session'] },
          () =>
            prisma.session.update({
              where: { sessionToken: jti },
              data: { lastSeenAt: new Date() },
            })
        ).catch((err) => {
          logger.error({ err, jti }, 'Failed to update session lastSeenAt');
        });
      }

      return mergedToken;
    },
  },
  events: {
    async signOut(message) {
      const token = (message as { token?: { jti?: string } }).token;
      if (token?.jti) {
        // Resolve user/tenant info before revoking the session
        let userId: string | null = null;
        let tenantId: string | null = null;
        try {
          const sessionRecord = await prisma.session.findUnique({
            where: { sessionToken: token.jti },
            select: { userId: true, user: { select: { tenantId: true } } },
          });
          userId = sessionRecord?.userId ?? null;
          tenantId = sessionRecord?.user?.tenantId ?? null;
        } catch {}

        await runWithAuthAdapterContext({ operation: 'session.revoke', models: ['Session'] }, () =>
          prisma.session.update({
            where: { sessionToken: token.jti },
            data: { revokedAt: new Date(), revokeReason: 'logout' },
          })
        ).catch((err) => {
          logger.error({ err, jti: token.jti }, 'Failed to revoke session on signOut');
        });

        // Emit session.revoked event
        await recordAuditTrailEvent({
          eventType: 'session.revoked',
          tenantId,
          actorId: userId,
          payload: { jti: token.jti, reason: 'logout' },
        }).catch(() => {});
      }
    },
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({
            email: z.string().email(),
            password: z.string().min(PASSWORD_POLICY.minLength),
          })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;

          // Validate password against security policy
          const passwordValidation = validatePassword(password);
          if (!passwordValidation.valid) {
            throw new Error(passwordValidation.error);
          }

          // Pre-tenant identity lookup runs under the narrow auth-adapter
          // bypass.  This bypass cannot reach business models (see
          // lib/auth/adapterContext.ts allow-list).
          const user = await runWithAuthAdapterContext(
            { operation: 'credentials.findUserByEmail', models: ['User'] },
            () => prisma.user.findUnique({ where: { email } })
          );
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
export async function getServerSession() {
  const session = await auth();
  return session;
}
