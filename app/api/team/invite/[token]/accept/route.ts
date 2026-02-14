
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
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
                    role: invitation.role,
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
        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
