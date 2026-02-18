/**
 * Pre-Warming Engine
 * 
 * Engages with prospects across GBP, Facebook, and Instagram 3-5 days before
 * outreach email delivery to create familiarity and boost open rates.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */

import { prisma } from '@/lib/db';
import type { PreWarmingAction, PreWarmingConfig, PreWarmingEngine } from './types';

/**
 * Default pre-warming configuration
 */
const DEFAULT_CONFIG: PreWarmingConfig = {
  windowDays: { min: 3, max: 5 },
  dailyLimits: { gbp: 20, facebook: 15, instagram: 15 },
};

/**
 * Schedule pre-warming actions for a prospect
 * 
 * Creates GBP/Facebook/Instagram engagement actions 3-5 days before outreach.
 * Respects daily limits per platform.
 * 
 * @param leadId - Prospect lead ID
 * @param outreachDate - Scheduled outreach email date
 * @param config - Pre-warming configuration (optional, uses defaults)
 * @returns Array of scheduled pre-warming actions
 */
export async function scheduleActions(
  leadId: string,
  outreachDate: Date,
  config: PreWarmingConfig = DEFAULT_CONFIG
): Promise<PreWarmingAction[]> {
  // Get the prospect to determine tenant and available platforms
  const lead = await prisma.prospectLead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      tenantId: true,
      sourceUrl: true,
      website: true,
    },
  });

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const actions: PreWarmingAction[] = [];
  const actionTypes: Array<PreWarmingAction['actionType']> = [
    'question',
    'like',
    'comment',
    'follow',
    'post_interaction',
  ];

  // Determine which platforms are available
  // In a real implementation, this would check for actual social media URLs
  // For now, we assume all platforms are available if the lead has a website or sourceUrl
  const hasOnlinePresence = !!(lead.website || lead.sourceUrl);
  const platforms: Array<{ platform: 'gbp' | 'facebook' | 'instagram'; available: boolean }> = [
    { platform: 'gbp', available: hasOnlinePresence },
    { platform: 'facebook', available: hasOnlinePresence },
    { platform: 'instagram', available: hasOnlinePresence },
  ];

  // Schedule actions within the pre-warming window (3-5 days before outreach)
  const windowStart = new Date(outreachDate);
  windowStart.setDate(windowStart.getDate() - config.windowDays.max);
  
  const windowEnd = new Date(outreachDate);
  windowEnd.setDate(windowEnd.getDate() - config.windowDays.min);

  // For each available platform, schedule 1-2 actions
  for (const { platform, available } of platforms) {
    if (!available) continue;

    // Randomly select 1-2 action types for this platform
    const numActions = Math.floor(Math.random() * 2) + 1; // 1 or 2 actions
    const selectedActionTypes = actionTypes
      .sort(() => Math.random() - 0.5)
      .slice(0, numActions);

    for (const actionType of selectedActionTypes) {
      // Schedule action at a random time within the window
      const scheduledAt = new Date(
        windowStart.getTime() + 
        Math.random() * (windowEnd.getTime() - windowStart.getTime())
      );

      // Check daily limit for this platform on the scheduled date
      const dailyCount = await getDailyActionCount(platform, scheduledAt);
      const limit = config.dailyLimits[platform];

      if (dailyCount >= limit) {
        // Skip this action if daily limit reached
        continue;
      }

      // Create the pre-warming action
      const action = await prisma.preWarmingAction.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          platform,
          actionType,
          scheduledAt,
          status: 'scheduled',
        },
      });

      actions.push({
        id: action.id,
        leadId: action.leadId,
        platform: action.platform as 'gbp' | 'facebook' | 'instagram',
        actionType: action.actionType as PreWarmingAction['actionType'],
        scheduledAt: action.scheduledAt,
        executedAt: action.executedAt ?? undefined,
        status: action.status as PreWarmingAction['status'],
      });
    }
  }

  return actions;
}

/**
 * Execute a pre-warming action
 * 
 * Performs the actual engagement action on the specified platform.
 * In a real implementation, this would integrate with platform APIs.
 * 
 * @param action - Pre-warming action to execute
 */
export async function executeAction(action: PreWarmingAction): Promise<void> {
  try {
    // In a real implementation, this would call platform-specific APIs:
    // - GBP: Post a question, like a post, respond to reviews
    // - Facebook: Like page, comment on post, follow
    // - Instagram: Like post, comment, follow
    
    // For now, we simulate the action execution
    console.log(`Executing ${action.actionType} on ${action.platform} for lead ${action.leadId}`);
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mark action as completed
    await prisma.preWarmingAction.update({
      where: { id: action.id },
      data: {
        status: 'completed',
        executedAt: new Date(),
      },
    });
  } catch (error) {
    // Log error and mark action as failed
    console.error(`Failed to execute pre-warming action ${action.id}:`, error);
    
    await prisma.preWarmingAction.update({
      where: { id: action.id },
      data: {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

/**
 * Check if pre-warming window is complete for a lead
 * 
 * Returns true if all scheduled actions are completed/failed/skipped,
 * or if the pre-warming window has expired.
 * 
 * @param leadId - Prospect lead ID
 * @returns True if window is complete, false otherwise
 */
export async function checkWindowComplete(leadId: string): Promise<boolean> {
  const actions = await prisma.preWarmingAction.findMany({
    where: { leadId },
  });

  if (actions.length === 0) {
    // No actions scheduled, window is complete
    return true;
  }

  // Check if all actions are in a terminal state
  const allComplete = actions.every(action =>
    action.status === 'completed' ||
    action.status === 'failed' ||
    action.status === 'skipped'
  );

  if (allComplete) {
    return true;
  }

  // Check if the latest scheduled action is in the past
  const latestScheduledAt = Math.max(
    ...actions.map(action => action.scheduledAt.getTime())
  );
  const now = Date.now();
  
  // If the latest action was scheduled more than 24 hours ago and still not complete,
  // consider the window expired
  if (now - latestScheduledAt > 24 * 60 * 60 * 1000) {
    return true;
  }

  return false;
}

/**
 * Get daily action count for a platform on a specific date
 * 
 * @param platform - Platform name (gbp, facebook, instagram)
 * @param date - Date to check
 * @returns Number of actions scheduled/executed on that date
 */
export async function getDailyActionCount(
  platform: string,
  date: Date
): Promise<number> {
  // Get start and end of the day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const count = await prisma.preWarmingAction.count({
    where: {
      platform,
      scheduledAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: {
        in: ['scheduled', 'completed'],
      },
    },
  });

  return count;
}

/**
 * Pre-Warming Engine implementation
 */
export const preWarmingEngine: PreWarmingEngine = {
  scheduleActions,
  executeAction,
  checkWindowComplete,
  getDailyActionCount,
};
