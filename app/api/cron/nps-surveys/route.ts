/**
 * app/api/cron/nps-surveys/route.ts
 *
 * Task 4: NPS Automation Cron
 *
 * Runs daily. Finds projects that have hit the Day-30 or Day-90 completion milestone
 * and sends NPS surveys if not already sent for that day.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendNPSSurvey } from '@/lib/retention/nps';
import { logger } from '@/lib/logger';
import { ProjectStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    // Security check
    const authHeader = req.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date();
        const results: Array<{ projectId: string; surveyDay: number; status: string }> = [];

        // Find completed projects
        const completedProjects = await (prisma as any).project.findMany({
            where: {
                status: ProjectStatus.COMPLETE,
                completedAt: { not: null },
            },
            include: {
                npsSurveys: { select: { surveyDay: true } },
            },
        });

        for (const project of completedProjects) {
            if (!project.completedAt) continue;

            const daysSinceComplete = Math.floor(
                (now.getTime() - new Date(project.completedAt).getTime()) / (1000 * 60 * 60 * 24)
            );

            const sentDays = new Set<number>(project.npsSurveys.map((s: any) => s.surveyDay));

            // Check Day 30
            if (daysSinceComplete >= 30 && daysSinceComplete < 35 && !sentDays.has(30)) {
                const surveyId = await sendNPSSurvey(project.id, 30);
                results.push({
                    projectId: project.id,
                    surveyDay: 30,
                    status: surveyId ? 'sent' : 'skipped',
                });
            }

            // Check Day 90
            if (daysSinceComplete >= 90 && daysSinceComplete < 95 && !sentDays.has(90)) {
                const surveyId = await sendNPSSurvey(project.id, 90);
                results.push({
                    projectId: project.id,
                    surveyDay: 90,
                    status: surveyId ? 'sent' : 'skipped',
                });
            }
        }

        logger.info({
            event: 'cron.nps_surveys.complete',
            processed: results.length,
            sent: results.filter(r => r.status === 'sent').length,
        }, 'NPS survey cron complete');

        return NextResponse.json({
            success: true,
            processed: results.length,
            results,
        });

    } catch (error) {
        logger.error({ event: 'cron.nps_surveys.error', error }, 'NPS Surveys Cron Error');
        return NextResponse.json(
            { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
