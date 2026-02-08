
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTenantId, createScopedPrisma } from '@/lib/tenant/context';
import { withAuth } from '@/lib/middleware/auth';

export const GET = withAuth(async (req: Request, { params }: { params: { id: string, previousId: string } }) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const prismaScoped = createScopedPrisma(tenantId);

        const { id, previousId } = params;

        // Fetch both audits with findings
        const [currentAudit, prevAudit] = await Promise.all([
            prismaScoped.audit.findUnique({ where: { id }, include: { findings: true } }),
            prismaScoped.audit.findUnique({ where: { id: previousId }, include: { findings: true } })
        ]);

        if (!currentAudit || !prevAudit) {
            return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
        }

        // Compare Logic
        // We compare based on Finding Title + Module + Category match
        // Key signature: `${module}-${category}-${title}`

        const generateKey = (f: any) => `${f.module}-${f.category}-${f.title}`;

        const prevMap = new Map();
        prevAudit.findings.forEach(f => prevMap.set(generateKey(f), f));

        const currentMap = new Map();
        currentAudit.findings.forEach(f => currentMap.set(generateKey(f), f));

        const improved: any[] = [];
        const worsened: any[] = []; // New findings that are bad
        const unchanged: any[] = [];
        const newFindings: any[] = []; // Newly discovered issues

        // 1. Check Previous vs Current (Did previous issues get fixed?)
        prevAudit.findings.forEach(prevF => {
            const key = generateKey(prevF);
            if (!currentMap.has(key)) {
                // If it's a PAINKILLER or VITAMIN and it's gone, it's IMPROVED
                improved.push(prevF);
            } else {
                // Still exists
                // We could check if scores changed, but for now it's "Unchanged"
                unchanged.push(currentMap.get(key));
            }
        });

        // 2. Check Current vs Previous (Are there new issues?)
        currentAudit.findings.forEach(currF => {
            const key = generateKey(currF);
            if (!prevMap.has(key)) {
                // New issue found
                newFindings.push(currF);
            }
        });

        // Calculate Score Change
        const scoreDiff = (currentAudit.overallScore || 0) - (prevAudit.overallScore || 0);

        return NextResponse.json({
            comparison: {
                improved,
                unchanged,
                newFindings,
                scoreDiff,
                prevDate: prevAudit.createdAt,
                currDate: currentAudit.createdAt
            }
        });

    } catch (error) {
        console.error('Comparison Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
