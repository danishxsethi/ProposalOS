
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

import { withAuth } from '@/lib/middleware/auth';

export const GET = withAuth(async (
    req: Request,
    { params }: { params: { id: string } }
) => {
    try {
        const id = params.id;

        const audit = await prisma.audit.findUnique({
            where: { id },
            include: {
                findings: true, // simplified for now
            },
        });

        if (!audit) {
            return NextResponse.json(
                { error: 'Audit not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(audit);

    } catch (error) {
        console.error('Error fetching audit:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
});
