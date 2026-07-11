import { NextResponse } from 'next/server';

import bcrypt from 'bcryptjs';

import { prisma, withSystemBypass } from '@/lib/prisma';
import { registerSchema } from '@/lib/schemas/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validatedData = registerSchema.parse(body);

    const result = await withSystemBypass('self-registration: no tenant exists yet', async () => {
      const existingUser = await prisma.user.findUnique({
        where: { email: validatedData.email },
      });

      if (existingUser) {
        return { alreadyExists: true as const };
      }

      const passwordHash = await bcrypt.hash(validatedData.password, 10);

      const created = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: `${validatedData.name}'s Workspace`,
          },
        });

        const user = await tx.user.create({
          data: {
            email: validatedData.email,
            name: validatedData.name,
            passwordHash,
            tenantId: tenant.id,
            role: 'owner',
          },
        });

        return { user, tenant };
      });

      return { alreadyExists: false as const, ...created };
    });

    if (result.alreadyExists) {
      return NextResponse.json(
        { message: 'User already exists with this email.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      user: { email: result.user.email, id: result.user.id },
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || 'Something went wrong' }, { status: 500 });
  }
}
