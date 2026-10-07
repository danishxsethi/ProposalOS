import { NextResponse } from 'next/server';

import bcrypt from 'bcryptjs';

import { INVITE_ASSIGNABLE_ROLES, normalizeRole } from '@/lib/auth/rbac';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { name, password } = body;

    if (!name || !password) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const invitation = await prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation || invitation.expiresAt < new Date() || invitation.acceptedAt) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 400 });
    }

    // Revalidate stored role at accept time — fail closed on legacy/invalid values.
    const role = normalizeRole(invitation.role);
    if (!role || role === 'super_admin' || !INVITE_ASSIGNABLE_ROLES.includes(role)) {
      logger.error(
        { invitationId: invitation.id, storedRole: invitation.role },
        'Invitation accept rejected: invalid stored role'
      );
      return NextResponse.json({ error: 'Invalid invitation role' }, { status: 400 });
    }

    // Check if user already exists (just in case)
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Transaction: Create User + Update Invitation
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email: invitation.email,
          passwordHash: hashedPassword,
          role,
          tenantId: invitation.tenantId,
          emailVerified: new Date(),
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return newUser;
    });

    // Auto-login? Or just redirect to login?
    // For simplicity, return success and let frontend redirect to login
    return NextResponse.json({ success: true, userId: user.id });
  } catch (e: any) {
    logger.error(e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
