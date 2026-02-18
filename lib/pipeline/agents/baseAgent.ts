/**
 * Base interface for AI service agents
 * 
 * Each agent type implements this interface to provide service delivery
 * for specific finding categories.
 */

export interface AgentResult {
  success: boolean;
  changes: string[];
  metrics?: Record<string, number>;
  error?: string;
}

export interface AgentContext {
  findingId: string;
  findingTitle: string;
  findingDescription?: string;
  evidence: any[];
  metrics: Record<string, any>;
  websiteUrl?: string;
  tenantId: string;
}

export interface ServiceAgent {
  /**
   * Execute the service delivery for a specific finding
   */
  execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Get the agent type identifier
   */
  getType(): string;

  /**
   * Validate that the agent can handle this finding
   */
  canHandle(findingCategory: string): boolean;
}

/**
 * Base agent implementation with common functionality
 */
export abstract class BaseAgent implements ServiceAgent {
  abstract execute(context: AgentContext): Promise<AgentResult>;
  abstract getType(): string;
  abstract canHandle(findingCategory: string): boolean;

  /**
   * Log agent activity
   */
  protected log(message: string, data?: any): void {
    console.log(`[${this.getType()}] ${message}`, data || '');
  }

  /**
   * Simulate work delay (for stub implementation)
   */
  protected async simulateWork(durationMs: number = 1000): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
  }
}
