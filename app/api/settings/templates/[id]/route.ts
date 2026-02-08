
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { withAuth } from '@/lib/middleware/auth';

export const GET = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prismaScoped = createScopedPrisma(tenantId);

        const template = await prismaScoped.proposalTemplate.findUnique({
            where: { id: params.id }
        });

        if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

        return NextResponse.json(template);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const prismaScoped = createScopedPrisma(tenantId);

        const template = await prismaScoped.proposalTemplate.update({
            where: { id: params.id },
            data: body
        });

        if (body.isDefault) {
            await prismaScoped.proposalTemplate.updateMany({
                where: {
                    id: { not: template.id },
                    isDefault: true
                },
                data: { isDefault: false }
            });
        }

        return NextResponse.json(template);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

export const DELETE = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prismaScoped = createScopedPrisma(tenantId);
        await prismaScoped.proposalTemplate.delete({
            where: { id: params.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
