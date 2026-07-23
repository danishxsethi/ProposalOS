/**
 * Delivery Agent Task Factory
 *
 * Pure logic for mapping accepted proposal deliverables to DeliveryAgentTask
 * records. No database connections — callers are responsible for persisting
 * the returned task objects.
 */

import type { DeliveryAgentType, DeliveryAgentStatus } from './baseDeliveryAgent';

// ---------------------------------------------------------------------------
// Deliverable types (proposal side)
// ---------------------------------------------------------------------------

export type DeliverableType =
  | 'website_redesign'
  | 'gbp_optimization'
  | 'paid_ads'
  | 'social_media'
  | 'reputation';

// ---------------------------------------------------------------------------
// Mapping: deliverable type → agent type
// ---------------------------------------------------------------------------

export const DELIVERABLE_TYPE_TO_AGENT_TYPE: Record<DeliverableType, DeliveryAgentType> = {
  website_redesign: 'website_redesign',
  gbp_optimization: 'gbp_optimization',
  paid_ads: 'paid_ads',
  social_media: 'social_media',
  reputation: 'reputation',
};

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export interface ProposalDeliverable {
  id: string;
  type: DeliverableType;
  description: string;
}

export interface AcceptedProposal {
  id: string;
  tenantId: string;
  clientId: string;
  acceptedAt: Date;
  deliverables: ProposalDeliverable[];
}

export interface DeliveryAgentTaskRecord {
  id: string;
  tenantId: string;
  clientId: string;
  deliverableId: string;
  agentType: DeliveryAgentType;
  status: DeliveryAgentStatus;
  config: Record<string, unknown>;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create one DeliveryAgentTask per deliverable in the accepted proposal.
 *
 * This is pure logic — no I/O. The caller persists the returned records.
 */
export function createDeliveryAgentTask(proposal: AcceptedProposal): DeliveryAgentTaskRecord[] {
  const now = new Date().toISOString();

  return proposal.deliverables.map((deliverable) => ({
    id: generateId(),
    tenantId: proposal.tenantId,
    clientId: proposal.clientId,
    deliverableId: deliverable.id,
    agentType: DELIVERABLE_TYPE_TO_AGENT_TYPE[deliverable.type],
    status: 'queued' as DeliveryAgentStatus,
    config: {},
    createdAt: now,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  // Simple UUID v4-like generator that works without crypto in all environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Re-export types from base for convenience
export type { DeliveryAgentType, DeliveryAgentStatus };
