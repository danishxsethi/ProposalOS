import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantFromApiKey } from '@/lib/auth/apiKeys';

async function validate(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    return await getTenantFromApiKey(authHeader.split(' ')[1]);
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
    const tenant = await validate(req);
    if (!tenant) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const audit = await prisma.audit.findUnique({
        where: { id: params.id },
        include: { findings: true }
    });

    if (!audit || audit.tenantId !== tenant.id) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: audit.id,
        status: audit.status,
        businessName: audit.businessName,
        overallScore: audit.overallScore,
        findings: audit.findings.map(f => ({
            type: f.type,
            title: f.title,
            score: f.impactScore,
            category: f.category
        }))
    });
}
