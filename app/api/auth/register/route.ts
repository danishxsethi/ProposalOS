import { NextResponse } from 'next/server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';
import { runWithTenantBypass } from '@/lib/tenant/context';

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  companyName: z.string().min(2),
});

// 10 registration attempts per 15 minutes per IP
const rateLimitOptions = { windowMs: 15 * 60 * 1000, max: 10 };

async function handleRegister(request: Request) {
  try {
    const body = await request.json();
    const { name, email, password, companyName } = registerSchema.parse(body);

    // Check if user exists (global uniqueness — no tenant context yet)
    const existingUser = await runWithTenantBypass('auth-register-email-uniqueness-check', () =>
      prisma.user.findUnique({ where: { email } })
    );

    // P2-23: do not confirm account existence via a distinct error message/status -- an
    // automated scanner could otherwise enumerate registered emails by mass-submitting
    // this endpoint and checking for the "User already exists" response. Respond exactly
    // like a fresh registration at the HTTP layer (2xx, no distinguishing message); no
    // duplicate account is created either way, so enforcement is unchanged. The frontend's
    // subsequent auto-login attempt fails for a guessed password and routes to /login --
    // the same outcome any wrong-password login attempt produces, not a new oracle.
    if (existingUser) {
      return NextResponse.json({
        user: { id: null, name: null, email },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Tenant and User in transaction (no tenant exists yet — bypass RLS for creation)
    const result = await runWithTenantBypass('auth-register-create-tenant-and-user', () =>
      prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            planTier: 'free',
            status: 'pending',
            subscriptionStatus: 'pending',
          },
        });

        const user = await tx.user.create({
          data: {
            name,
            email,
            passwordHash: hashedPassword,
            // P2-07/owner-carryover: 'owner' is not a Role in lib/auth/rbac.ts's
            // ROLE_HIERARCHY — normalizeRole() now fails closed on it (Wave 0), which
            // would lock a self-registered tenant admin out of their own gated routes.
            // agency_admin is the least-privileged real role that can administer a
            // newly created tenant (never super_admin).
            role: 'agency_admin',
            tenantId: tenant.id,
          },
        });

        return { user, tenant };
      })
    );

    return NextResponse.json({
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

// Apply rate limiting
const rateLimitedHandler = (req: Request) =>
  withRateLimit({
    ...rateLimitOptions,
    message: 'Too many attempts. Try again later.',
  })(req, () => handleRegister(req));

export const POST = rateLimitedHandler;
