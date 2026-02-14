import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const audit = await prisma.audit.findUnique({
            where: { id },
            select: {
                status: true,
                modulesCompleted: true,
                overallScore: true,
                findings: {
                    where: { type: 'PAINKILLER' }, // Only show painkillers for teaser
                    take: 3,
                    select: {
                        title: true,
                        impactScore: true,
                        category: true
                    }
                }
            }
        });

        if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json(audit);

    } catch (error) {
        return NextResponse.json({ error: 'Error' }, { status: 500 });
    }
}
