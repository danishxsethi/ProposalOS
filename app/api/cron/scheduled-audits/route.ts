
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AuditOrchestrator } from '@/lib/orchestrator/auditOrchestrator';
import { CostTracker } from '@/lib/costs/costTracker';
import { sendWebhook } from '@/lib/notifications/webhook';

export async function GET(req: Request) {
    // 1. Security Check (CRON_SECRET)
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();

        // 2. Find Due Schedules (limit to 5 to prevent timeout)
        const dueSchedules = await prisma.auditSchedule.findMany({
            where: {
                isActive: true,
                nextRunAt: { lte: now }
            },
            include: {
                tenant: true
            },
            take: 5, // Process max 5 per run to prevent timeout
            orderBy: { nextRunAt: 'asc' } // Oldest first
        });

        if (dueSchedules.length === 0) {
            return NextResponse.json({
                success: true,
                processed: 0,
                message: 'No schedules due'
            });
        }

        logger.info({
            event: 'cron.scheduled_audits.start',
            count: dueSchedules.length
        }, `Processing ${dueSchedules.length} scheduled audits`);

        const results = [];

        for (const schedule of dueSchedules) {
            try {
                // Validate required fields
                if (!schedule.businessUrl || !schedule.businessName || !schedule.businessCity) {
                    logger.warn({
                        event: 'cron.scheduled_audits.skip',
                        scheduleId: schedule.id,
                        reason: 'Missing required fields'
                    }, 'Skipping schedule with incomplete data');

                    results.push({
                        id: schedule.id,
                        status: 'Skipped',
                        reason: 'Missing required fields'
                    });
                    continue;
                }

                // 3. Create Audit Record
                const audit = await prisma.audit.create({
                    data: {
                        tenantId: schedule.tenantId,
                        businessName: schedule.businessName,
                        businessCity: schedule.businessCity,
                        businessUrl: schedule.businessUrl,
                        businessIndustry: schedule.industry || 'Generic',
                        status: 'RUNNING',
                        startedAt: now,
                        apiCostCents: 0,
                        batchId: `scheduled-${now.toISOString().split('T')[0]}`,
                    }
                });

                logger.info({
                    event: 'cron.scheduled_audits.audit_created',
                    auditId: audit.id,
                    scheduleId: schedule.id,
                    businessName: schedule.businessName
                }, 'Created audit from schedule');

                // 4. Initialize Orchestrator
                const tracker = new CostTracker();

                // Module completion callback
                const onModuleComplete = async (moduleId: string, status: 'success' | 'failed') => {
                    try {
                        if (status === 'success') {
                            await prisma.audit.update({
                                where: { id: audit.id },
                                data: {
                                    modulesCompleted: { push: moduleId }
                                }
                            });
                        } else {
                            const current = await prisma.audit.findUnique({
                                where: { id: audit.id },
                                select: { modulesFailed: true }
                            });

                            await prisma.audit.update({
                                where: { id: audit.id },
                                data: {
                                    modulesFailed: [
                                        ...(Array.isArray(current?.modulesFailed) ? current.modulesFailed : []),
                                        { module: moduleId, error: 'Module execution failed' }
                                    ]
                                }
                            });
                        }
                    } catch (error) {
                        logger.error({
                            event: 'cron.scheduled_audits.module_callback_error',
                            auditId: audit.id,
                            moduleId,
                            error
                        }, 'Failed to update module status');
                    }
                };

                const orchestrator = new AuditOrchestrator({
                    auditId: audit.id,
                    businessName: schedule.businessName,
                    websiteUrl: schedule.businessUrl,
                    city: schedule.businessCity,
                    industry: schedule.industry || 'Generic'
                }, tracker, onModuleComplete);

                // 5. Run audit asynchronously (fire-and-forget to prevent timeout)
                orchestrator.run()
                    .then(async (result) => {
                        logger.info({
                            event: 'cron.scheduled_audits.audit_completed',
                            auditId: audit.id,
                            status: result.status,
                            modulesCompleted: result.modulesCompleted?.length || 0
                        }, 'Scheduled audit completed');

                        // Update audit status
                        await prisma.audit.update({
                            where: { id: audit.id },
                            data: {
                                status: result.status === 'COMPLETE' ? 'COMPLETE' : 'FAILED',
                                completedAt: new Date(),
                                apiCostCents: tracker.getTotalCents(),
                                overallScore: result.status === 'COMPLETE' ?
                                    Math.round((result.modulesCompleted?.length || 0) / 15 * 100) : undefined
                            }
                        });

                        // Send webhook notification
                        await sendWebhook('audit.completed', {
                            auditId: audit.id,
                            scheduleId: schedule.id,
                            status: result.status,
                            businessName: schedule.businessName,
                            source: 'scheduled'
                        });
                    })
                    .catch(async (error) => {
                        logger.error({
                            event: 'cron.scheduled_audits.audit_failed',
                            auditId: audit.id,
                            error: error.message
                        }, 'Scheduled audit failed');

                        // Update audit to failed status
                        await prisma.audit.update({
                            where: { id: audit.id },
                            data: {
                                status: 'FAILED',
                                completedAt: new Date(),
                                apiCostCents: tracker.getTotalCents()
                            }
                        });

                        // Send failure webhook
                        await sendWebhook('audit.failed', {
                            auditId: audit.id,
                            scheduleId: schedule.id,
                            error: error.message,
                            businessName: schedule.businessName,
                            source: 'scheduled'
                        });
                    });

                // 6. Update Schedule for next run
                const nextRun = calculateNextRun(schedule.frequency, now);
                await prisma.auditSchedule.update({
                    where: { id: schedule.id },
                    data: {
                        lastRunAt: now,
                        nextRunAt: nextRun,
                        lastAuditId: audit.id
                    }
                });

                logger.info({
                    event: 'cron.scheduled_audits.schedule_updated',
                    scheduleId: schedule.id,
                    nextRunAt: nextRun
                }, 'Updated schedule for next run');

                results.push({
                    id: schedule.id,
                    auditId: audit.id,
                    status: 'Started',
                    nextRunAt: nextRun
                });

            } catch (err) {
                logger.error({
                    event: 'cron.scheduled_audits.schedule_error',
                    scheduleId: schedule.id,
                    error: err
                }, `Failed to process schedule ${schedule.id}`);

                results.push({
                    id: schedule.id,
                    status: 'Failed',
                    error: err instanceof Error ? err.message : 'Unknown error'
                });
            }
        }

        logger.info({
            event: 'cron.scheduled_audits.complete',
            processed: results.length,
            started: results.filter(r => r.status === 'Started').length,
            failed: results.filter(r => r.status === 'Failed').length
        }, 'Scheduled audits cron complete');

        return NextResponse.json({
            success: true,
            processed: results.length,
            results
        });

    } catch (error) {
        logger.error({
            event: 'cron.scheduled_audits.error',
            error
        }, 'Scheduled Audits Cron Error');

        return NextResponse.json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

function calculateNextRun(frequency: string, current: Date): Date {
    const base = new Date(); // Use NOW to prevent catch-up loops

    switch (frequency) {
        case 'weekly':
            base.setDate(base.getDate() + 7);
            break;
        case 'biweekly':
            base.setDate(base.getDate() + 14);
            break;
        case 'monthly':
            base.setMonth(base.getMonth() + 1);
            break;
        case 'quarterly':
            base.setMonth(base.getMonth() + 3);
            break;
        default:
            base.setDate(base.getDate() + 7); // Default weekly
    }
    return base;
}
