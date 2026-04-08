import { NextResponse } from 'next/server';

import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { withRateLimit } from '@/lib/middleware/rateLimit';
import { prisma } from '@/lib/prisma';

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

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create Tenant and User in transaction
    const result = await prisma.$transaction(async (tx) => {
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
          role: 'owner',
          tenantId: tenant.id,
        },
      });

      return { user, tenant };
    });

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
