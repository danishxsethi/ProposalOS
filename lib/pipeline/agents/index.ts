/**
 * AI Service Agents
 * 
 * This module exports all AI service agents for delivery engine.
 * Each agent handles a specific category of findings.
 */

export { BaseAgent, type ServiceAgent, type AgentContext, type AgentResult } from './baseAgent';
export { SpeedOptimizationAgent, speedOptimizationAgent } from './speedOptimizationAgent';
export { SeoFixAgent, seoFixAgent } from './seoFixAgent';
export { AccessibilityAgent, accessibilityAgent } from './accessibilityAgent';
export { SecurityHardeningAgent, securityHardeningAgent } from './securityHardeningAgent';
export { ContentGenerationAgent, contentGenerationAgent } from './contentGenerationAgent';
export { PredictiveAgent, predictiveAgent } from './predictiveAgent';

import { speedOptimizationAgent } from './speedOptimizationAgent';
import { seoFixAgent } from './seoFixAgent';
import { accessibilityAgent } from './accessibilityAgent';
import { securityHardeningAgent } from './securityHardeningAgent';
import { contentGenerationAgent } from './contentGenerationAgent';
import { predictiveAgent } from './predictiveAgent';
import type { ServiceAgent } from './baseAgent';

/**
 * Agent registry mapping agent types to agent instances
 */
export const agentRegistry: Record<string, ServiceAgent> = {
  speed_optimization: speedOptimizationAgent,
  seo_fix: seoFixAgent,
  accessibility: accessibilityAgent,
  security_hardening: securityHardeningAgent,
  content_generation: contentGenerationAgent,
  predictive_agent: predictiveAgent,
};

/**
 * Get an agent by type
 */
export function getAgent(agentType: string): ServiceAgent | undefined {
  return agentRegistry[agentType];
}

/**
 * Get an agent for a finding category
 */
export function getAgentForCategory(category: string): ServiceAgent | undefined {
  return Object.values(agentRegistry).find((agent) => agent.canHandle(category));
}
