import { prisma } from '@/lib/prisma';
import { AuditOrchestrator, OrchestratorResult } from './auditOrchestrator';
import { CostTracker } from '@/lib/costs/costTracker';

export async function runAuditOrchestrator(auditId: string) {
    console.log(`[Runner] Starting audit ${auditId}`);

    // 1. Fetch Audit
    const audit = await prisma.audit.findUnique({ where: { id: auditId } });
    if (!audit) throw new Error('Audit not found');

    if (audit.status !== 'QUEUED') {
        console.log(`[Runner] Audit ${auditId} already ${audit.status}`);
        return;
    }

    // 2. Set Status Running
    await prisma.audit.update({
        where: { id: auditId },
        data: { status: 'RUNNING', startedAt: new Date() }
    });

    const tracker = new CostTracker();

    // 3. Initialize Orchestrator
    const orchestrator = new AuditOrchestrator({
        auditId: audit.id,
        businessName: audit.businessName,
        websiteUrl: audit.businessUrl || '', // Should validate before
        city: audit.businessCity || 'Unknown',
        industry: audit.businessIndustry || 'General'
    }, tracker, async (moduleId, status) => {
        // Callback: Update DB
        if (status === 'success') {
            await prisma.audit.update({
                where: { id: auditId },
                data: { modulesCompleted: { push: moduleId } }
            });
        } else {
            // For now, we don't rigidly track failed modules in a separate simple array unless added to schema
            // But existing schema has `modulesFailed: Json`.
            // We'd need to fetch, parse, push, update. A bit heavy for high-frequency?
            // Let's assume we just log or handle lightly.
            // Ideally: atomic update if Postgres supports JSONB append, Prisma doesn't natively easily.
            // We'll skip complex failure tracking in real-time loop to avoid race conditions/locking, 
            // relying on final update.
        }
    });

    try {
        // 4. Run
        const result: OrchestratorResult = await orchestrator.run();

        // 5. Save Final Results (map DEGRADED to PARTIAL for Prisma enum)
        const dbStatus = result.status === 'DEGRADED' ? 'PARTIAL' : result.status;
        await prisma.audit.update({
            where: { id: auditId },
            data: {
                status: dbStatus,
                completedAt: new Date(),
                findings: {
                    create: result.findings.map(f => ({
                        module: 'orchestrator', // or specific module if preserved
                        category: f.category || 'general',
                        type: f.type || 'VITAMIN',
                        title: f.title,
                        description: f.description,
                        impactScore: f.impactScore || 50,
                        confidenceScore: f.confidenceScore || 100
                    }))
                },
                apiCostCents: tracker.getTotalCents()
            }
        });

        console.log(`[Runner] Audit ${auditId} complete: ${result.status}`);

    } catch (error) {
        console.error(`[Runner] Audit ${auditId} crash`, error);
        await prisma.audit.update({
            where: { id: auditId },
            data: { status: 'FAILED' }
        });
    }
}
