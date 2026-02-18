import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { deliveryEngine } from '@/lib/pipeline/deliveryEngine';

const MAX_TASKS_PER_RUN = 50;

export async function GET(req: Request) {
  // 1. CRON_SECRET auth
  const authHeader = req.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    logger.info(
      {
        event: 'cron.delivery.start',
      },
      'Starting delivery cron job'
    );

    // 2. Process queued delivery tasks
    const queuedTasks = await prisma.deliveryTask.findMany({
      where: {
        status: 'queued',
      },
      take: MAX_TASKS_PER_RUN,
      orderBy: { createdAt: 'asc' },
    });

    logger.info(
      {
        event: 'cron.delivery.queued_tasks',
        count: queuedTasks.length,
      },
      `Found ${queuedTasks.length} queued delivery tasks`
    );

    const dispatchResults: Array<{
      taskId: string;
      status: string;
      error?: string;
    }> = [];

    // Dispatch queued tasks to agents
    for (const task of queuedTasks) {
      try {
        await deliveryEngine.dispatchToAgent({
          id: task.id,
          proposalId: task.proposalId,
          findingId: task.findingId,
          agentType: task.agentType as any,
          status: task.status as any,
          estimatedCompletionDate: task.estimatedCompletionDate,
          completedAt: task.completedAt || undefined,
          verificationAuditId: task.verificationAuditId || undefined,
          beforeAfterComparison: task.beforeAfterComparison as Record<string, unknown> | undefined,
        });

        dispatchResults.push({
          taskId: task.id,
          status: 'Dispatched',
        });

        logger.info(
          {
            event: 'cron.delivery.task_dispatched',
            taskId: task.id,
            agentType: task.agentType,
          },
          `Dispatched task ${task.id} to ${task.agentType} agent`
        );
      } catch (err) {
        dispatchResults.push({
          taskId: task.id,
          status: 'Failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });

        logger.error(
          {
            event: 'cron.delivery.task_dispatch_failed',
            taskId: task.id,
            error: err,
          },
          `Failed to dispatch task ${task.id}`
        );
      }
    }

    // 3. Verify completed tasks
    const completedTasks = await prisma.deliveryTask.findMany({
      where: {
        status: 'completed',
      },
      take: MAX_TASKS_PER_RUN,
      orderBy: { completedAt: 'asc' },
    });

    logger.info(
      {
        event: 'cron.delivery.completed_tasks',
        count: completedTasks.length,
      },
      `Found ${completedTasks.length} completed tasks to verify`
    );

    const verificationResults: Array<{
      taskId: string;
      status: string;
      verified?: boolean;
      error?: string;
    }> = [];

    for (const task of completedTasks) {
      try {
        const result = await deliveryEngine.verifyDeliverable(task.id);

        verificationResults.push({
          taskId: task.id,
          status: 'Verified',
          verified: result.verified,
        });

        logger.info(
          {
            event: 'cron.delivery.task_verified',
            taskId: task.id,
            verified: result.verified,
            improvementPercent: result.improvementPercent,
          },
          `Verified task ${task.id}`
        );
      } catch (err) {
        verificationResults.push({
          taskId: task.id,
          status: 'Verification Failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });

        logger.error(
          {
            event: 'cron.delivery.task_verification_failed',
            taskId: task.id,
            error: err,
          },
          `Failed to verify task ${task.id}`
        );
      }
    }

    // 4. Escalate overdue tasks
    const escalated = await deliveryEngine.escalateOverdue();

    logger.info(
      {
        event: 'cron.delivery.escalated_tasks',
        count: escalated.length,
      },
      `Escalated ${escalated.length} overdue tasks`
    );

    // 5. Check for completed proposals and transition to "delivered"
    const verifiedTasks = await prisma.deliveryTask.findMany({
      where: {
        status: 'verified',
      },
      select: {
        proposalId: true,
      },
      distinct: ['proposalId'],
    });

    const deliveredProposals: string[] = [];

    for (const { proposalId } of verifiedTasks) {
      try {
        const allComplete = await deliveryEngine.checkAllComplete(proposalId);

        if (allComplete) {
          // Update proposal status to delivered (if such a status exists)
          // For now, we'll just log it
          deliveredProposals.push(proposalId);

          logger.info(
            {
              event: 'cron.delivery.proposal_delivered',
              proposalId,
            },
            `All deliverables complete for proposal ${proposalId}`
          );
        }
      } catch (err) {
        logger.error(
          {
            event: 'cron.delivery.proposal_check_failed',
            proposalId,
            error: err,
          },
          `Failed to check completion for proposal ${proposalId}`
        );
      }
    }

    logger.info(
      {
        event: 'cron.delivery.complete',
        dispatched: dispatchResults.filter((r) => r.status === 'Dispatched').length,
        verified: verificationResults.filter((r) => r.status === 'Verified').length,
        escalated: escalated.length,
        delivered: deliveredProposals.length,
      },
      'Delivery cron complete'
    );

    return NextResponse.json({
      success: true,
      dispatched: dispatchResults.length,
      verified: verificationResults.length,
      escalated: escalated.length,
      delivered: deliveredProposals.length,
      results: {
        dispatchResults,
        verificationResults,
        escalatedTasks: escalated.map((t) => t.id),
        deliveredProposals,
      },
    });
  } catch (error) {
    logger.error(
      {
        event: 'cron.delivery.error',
        error,
      },
      'Delivery Cron Error'
    );

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
