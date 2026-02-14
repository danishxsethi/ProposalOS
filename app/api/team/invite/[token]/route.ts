
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    const invitation = await prisma.invitation.findUnique({
        where: { token },
        include: { tenant: true }
    });

    if (!invitation) {
        return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
    }

    if (invitation.expiresAt < new Date()) {
        return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
    }

    if (invitation.acceptedAt) {
        return NextResponse.json({ error: 'Invitation already accepted' }, { status: 409 });
    }

    return NextResponse.json({
        email: invitation.email,
        tenantName: invitation.tenant.name,
        role: invitation.role
    });
}
