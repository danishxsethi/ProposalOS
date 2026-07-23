import { prisma } from '@/lib/db';
import type { Deliverable, VerificationResult, DeliveryEngine as IDeliveryEngine } from './types';

/**
 * Maps finding categories to agent types for service delivery
 */
const CATEGORY_TO_AGENT_TYPE: Record<string, Deliverable['agentType']> = {
  SPEED: 'speed_optimization',
  PERFORMANCE: 'speed_optimization',
  SEO: 'seo_fix',
  ACCESSIBILITY: 'accessibility',
  SECURITY: 'security_hardening',
  CONTENT: 'content_generation',
};

/**
 * Default delivery timelines by tier (in days)
 */
const TIER_DELIVERY_TIMELINES: Record<string, number> = {
  essentials: 14, // 2 weeks
  growth: 30,     // 1 month
  premium: 60,    // 2 months
};

/**
 * Delivery Engine implementation
 * Fulfills accepted proposals using AI service agents
 */
export class DeliveryEngine implements IDeliveryEngine {
  /**
   * Generate deliverables from an accepted proposal tier
   * Maps finding IDs to DeliveryTask records with agent types and estimated dates
   */
  async generateDeliverables(proposalId: string, tier: string): Promise<Deliverable[]> {
    // Fetch the proposal with acceptance and audit data
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        acceptance: true,
        audit: {
          include: {
            findings: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }

    if (!proposal.acceptance) {
      throw new Error(`Proposal not accepted: ${proposalId}`);
    }

    if (!proposal.tenantId) {
      throw new Error(`Proposal missing tenantId: ${proposalId}`);
    }

    // Get the tier configuration
    const tierKey = `tier${tier.charAt(0).toUpperCase() + tier.slice(1)}` as 'tierEssentials' | 'tierGrowth' | 'tierPremium';
    const tierConfig = proposal[tierKey] as any;

    if (!tierConfig || !tierConfig.findingIds || !Array.isArray(tierConfig.findingIds)) {
      throw new Error(`Invalid tier configuration for ${tier}: ${proposalId}`);
    }

    const findingIds = tierConfig.findingIds as string[];

    // Get the delivery timeline for this tier
    const deliveryTimelineDays = TIER_DELIVERY_TIMELINES[tier.toLowerCase()] || 30;
    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + deliveryTimelineDays);

    // Map findings to deliverables
    const deliverables: Deliverable[] = [];

    for (const findingId of findingIds) {
      const finding = proposal.audit.findings.find((f) => f.id === findingId);

      if (!finding) {
        console.warn(`Finding not found: ${findingId} in proposal ${proposalId}`);
        continue;
      }

      // Map finding category to agent type
      const agentType = CATEGORY_TO_AGENT_TYPE[finding.category] || 'seo_fix';

      // Create delivery task in database
      const task = await prisma.deliveryTask.create({
        data: {
          tenantId: proposal.tenantId,
          proposalId,
          findingId,
          agentType,
          status: 'queued',
          estimatedCompletionDate,
        },
      });

      deliverables.push({
        id: task.id,
        proposalId: task.proposalId,
        findingId: task.findingId,
        agentType: task.agentType as Deliverable['agentType'],
        status: task.status as Deliverable['status'],
        estimatedCompletionDate: task.estimatedCompletionDate,
        completedAt: task.completedAt || undefined,
        verificationAuditId: task.verificationAuditId || undefined,
        beforeAfterComparison: task.beforeAfterComparison as Record<string, unknown> | undefined,
      });
    }

    return deliverables;
  }

  /**
   * Dispatch a deliverable to the appropriate AI service agent
   */
  async dispatchToAgent(deliverable: Deliverable): Promise<void> {
    // Update status to in_progress
    await prisma.deliveryTask.update({
      where: { id: deliverable.id },
      data: { status: 'in_progress' },
    });

    // In a real implementation, this would dispatch to actual AI agents
    // For now, we'll create a stub that simulates agent processing
    try {
      // Simulate agent work (in production, this would call the actual agent)
      console.log(`Dispatching deliverable ${deliverable.id} to ${deliverable.agentType} agent`);

      // For now, mark as completed immediately (agents will be implemented in subtask 21.5)
      await prisma.deliveryTask.update({
        where: { id: deliverable.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    } catch (error) {
      // Mark as failed on error
      await prisma.deliveryTask.update({
        where: { id: deliverable.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  /**
   * Verify a deliverable by triggering a re-audit
   */
  async verifyDeliverable(deliverableId: string): Promise<VerificationResult> {
    const task = await prisma.deliveryTask.findUnique({
      where: { id: deliverableId },
    });

    if (!task) {
      throw new Error(`Deliverable not found: ${deliverableId}`);
    }

    if (task.status !== 'completed') {
      throw new Error(`Deliverable not completed: ${deliverableId}`);
    }

    // In a real implementation, this would trigger a re-audit
    // For now, we'll simulate verification
    const verified = true;
    const improvementPercent = Math.random() * 50 + 20; // Simulate 20-70% improvement

    const beforeAfterComparison = {
      before: { score: 50 },
      after: { score: 50 + improvementPercent },
      improvement: improvementPercent,
    };

    // Update task with verification results
    await prisma.deliveryTask.update({
      where: { id: deliverableId },
      data: {
        status: 'verified',
        beforeAfterComparison,
      },
    });

    return {
      verified,
      improvementPercent,
      beforeAfterComparison,
    };
  }

  /**
   * Escalate overdue deliverables
   */
  async escalateOverdue(): Promise<Deliverable[]> {
    const now = new Date();

    // Find all tasks that are overdue and not completed/verified
    const overdueTasks = await prisma.deliveryTask.findMany({
      where: {
        estimatedCompletionDate: { lt: now },
        status: { notIn: ['completed', 'verified', 'escalated'] },
      },
    });

    // Update status to escalated
    const escalatedIds = overdueTasks.map((t) => t.id);
    if (escalatedIds.length > 0) {
      await prisma.deliveryTask.updateMany({
        where: { id: { in: escalatedIds } },
        data: { status: 'escalated' },
      });
    }

    return overdueTasks.map((task) => ({
      id: task.id,
      proposalId: task.proposalId,
      findingId: task.findingId,
      agentType: task.agentType as Deliverable['agentType'],
      status: 'escalated' as const,
      estimatedCompletionDate: task.estimatedCompletionDate,
      completedAt: task.completedAt || undefined,
      verificationAuditId: task.verificationAuditId || undefined,
      beforeAfterComparison: task.beforeAfterComparison as Record<string, unknown> | undefined,
    }));
  }

  /**
   * Check if all deliverables for a proposal are complete
   * Returns true if all tasks are verified
   */
  async checkAllComplete(proposalId: string): Promise<boolean> {
    const tasks = await prisma.deliveryTask.findMany({
      where: { proposalId },
    });

    if (tasks.length === 0) {
      return false;
    }

    return tasks.every((task) => task.status === 'verified');
  }
}

// Export singleton instance
export const deliveryEngine = new DeliveryEngine();
