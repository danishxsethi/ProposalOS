/**
 * Base Delivery Agent
 *
 * Provides the common interface and shared behaviour for all Sprint 5-6 delivery
 * agents (website_redesign, gbp_optimization, paid_ads, social_media, reputation).
 *
 * Key features:
 *  - Typed execute / getStatus / retry / escalate interface
 *  - Exponential-backoff retry (up to 3 attempts by default)
 *  - Per-execution cost tracking in cents
 *
 * Multi-Model Orchestration (Requirements 16.1, 16.3):
 * Subclasses that make LLM calls should use `getOrchestratedModel(taskType)` from
 * `@/lib/llm/gemini` instead of `getGeminiModel(...)` directly. This routes through
 * `selectModel()` + `executeWithFallback()` for dynamic model selection and failover.
 * Recommended taskType values per agent:
 *   - website_redesign → 'website_redesign'
 *   - gbp_optimization → 'gbp_optimization'
 *   - paid_ads         → 'paid_ads'
 *   - social_media     → 'social_media'
 *   - reputation       → 'reputation'
 */

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

export type DeliveryAgentType =
  | 'website_redesign'
  | 'gbp_optimization'
  | 'paid_ads'
  | 'social_media'
  | 'reputation';

export type DeliveryAgentStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'escalated'
  | 'awaiting_approval';

// ---------------------------------------------------------------------------
// Shared data shapes
// ---------------------------------------------------------------------------

export interface DeliveryAgentContext {
  /** Unique task identifier (maps to DeliveryAgentTask.id in Prisma) */
  taskId: string;
  tenantId: string;
  /** Proposal that triggered this delivery task */
  proposalId: string;
  /** Agent-specific configuration payload */
  config: Record<string, unknown>;
}

export interface DeliveryAgentResult {
  success: boolean;
  /** Human-readable summary of what was done */
  summary: string;
  /** Arbitrary output data produced by the agent */
  data?: Record<string, unknown>;
  /** Cost of this execution in US cents */
  costCents: number;
  /** ISO timestamp when execution finished */
  completedAt: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Core interface every delivery agent must satisfy
// ---------------------------------------------------------------------------

export interface IDeliveryAgent {
  /** Return the agent type identifier */
  getAgentType(): DeliveryAgentType;

  /** Return the current status of the agent task */
  getStatus(): DeliveryAgentStatus;

  /**
   * Execute the delivery task.
   * Implementations should NOT call retry internally; the base class handles
   * retry orchestration via `executeWithRetry`.
   */
  execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult>;

  /**
   * Retry the task using exponential backoff.
   * Returns the result of the final attempt (success or failure).
   */
  retry(context: DeliveryAgentContext): Promise<DeliveryAgentResult>;

  /**
   * Escalate the task to human review.
   * Sets status to 'escalated' and records the reason.
   */
  escalate(reason: string): void;
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

export interface RetryConfig {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  baseDelayMs: number;
  /** Multiplier applied to the delay on each retry. Default: 2 */
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
};

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

export interface CostRecord {
  attemptNumber: number;
  costCents: number;
  succeededAt?: string;
  failedAt?: string;
}

// ---------------------------------------------------------------------------
// Abstract base class
// ---------------------------------------------------------------------------

export abstract class BaseDeliveryAgent implements IDeliveryAgent {
  protected status: DeliveryAgentStatus = 'queued';
  protected escalationReason: string | null = null;
  protected costRecords: CostRecord[] = [];
  protected retryConfig: RetryConfig;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  // -------------------------------------------------------------------------
  // Interface implementation
  // -------------------------------------------------------------------------

  abstract getAgentType(): DeliveryAgentType;

  getStatus(): DeliveryAgentStatus {
    return this.status;
  }

  /**
   * Subclasses implement the actual delivery logic here.
   * Should throw on failure so the retry loop can catch it.
   */
  abstract execute(context: DeliveryAgentContext): Promise<DeliveryAgentResult>;

  /**
   * Retry with exponential backoff up to `maxAttempts`.
   *
   * Attempt schedule (baseDelayMs = 1000, multiplier = 2):
   *   Attempt 1 – immediate
   *   Attempt 2 – wait 1 s
   *   Attempt 3 – wait 2 s
   */
  async retry(context: DeliveryAgentContext): Promise<DeliveryAgentResult> {
    const { maxAttempts, baseDelayMs, backoffMultiplier } = this.retryConfig;
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        const delayMs = baseDelayMs * Math.pow(backoffMultiplier, attempt - 2);
        await this.delay(delayMs);
      }

      this.status = 'in_progress';

      try {
        const result = await this.execute(context);

        this.recordCost(attempt, result.costCents, true);
        this.status = result.success ? 'completed' : 'failed';
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.recordCost(attempt, 0, false);
        this.log(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);
      }
    }

    this.status = 'failed';
    return {
      success: false,
      summary: `All ${maxAttempts} attempts failed`,
      costCents: this.getTotalCostCents(),
      completedAt: new Date().toISOString(),
      error: lastError.message,
    };
  }

  escalate(reason: string): void {
    this.status = 'escalated';
    this.escalationReason = reason;
    this.log(`Escalated: ${reason}`);
  }

  // -------------------------------------------------------------------------
  // Cost tracking helpers
  // -------------------------------------------------------------------------

  /** Total cost across all recorded attempts in cents */
  getTotalCostCents(): number {
    return this.costRecords.reduce((sum, r) => sum + r.costCents, 0);
  }

  /** Full cost audit trail */
  getCostRecords(): CostRecord[] {
    return [...this.costRecords];
  }

  // -------------------------------------------------------------------------
  // Protected helpers for subclasses
  // -------------------------------------------------------------------------

  protected log(message: string, data?: unknown): void {
    console.log(`[${this.getAgentType()}] ${message}`, data ?? '');
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private recordCost(attempt: number, costCents: number, success: boolean): void {
    const now = new Date().toISOString();
    this.costRecords.push({
      attemptNumber: attempt,
      costCents,
      ...(success ? { succeededAt: now } : { failedAt: now }),
    });
  }
}
