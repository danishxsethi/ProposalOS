/**
 * LLM Audit Logging Layer
 *
 * Logs all LLM requests for security, compliance, and observability.
 * Tracks who made the request, when, what model, and for what purpose.
 *
 * Features:
 * - Request/response logging with PII redaction
 * - User/tenant context tracking
 * - Cost and token tracking
 * - Performance metrics
 * - Security audit trail
 */

import { logger } from '@/lib/logger';
import { getCorrelationId, getTraceId } from '@/lib/observability/context';
import { PiiScrubber } from '@/lib/security/piiScrubber';

export interface LlmAuditLog {
  // Request info
  timestamp: string;
  model: string;
  nodeId?: string;
  auditId?: string;
  experimentId?: string;
  variantId?: string;

  // Context
  tenantId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;

  // Input (redacted)
  inputPreview: string;
  inputHash?: string;
  inputTokens: number;

  // Output (redacted)
  outputPreview?: string;
  outputHash?: string;
  outputTokens?: number;
  thoughtsTokens?: number;

  // Performance
  latencyMs: number;

  // Cost
  costUsd?: number;

  // Status
  success: boolean;
  errorType?: string;
  errorMessage?: string;

  // Security
  piiDetected: boolean;
  promptLeakDetected: boolean;
}

export interface AuditLogOptions {
  tenantId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  auditId?: string;
  nodeId?: string;
  experimentId?: string;
  variantId?: string;
}

class LlmAuditLogger {
  private enabled: boolean;
  private logLevel: 'all' | 'errors' | 'none';
  private redactInput: boolean;
  private redactOutput: boolean;

  constructor() {
    this.enabled = process.env.LLM_AUDIT_LOG_ENABLED !== 'false';
    this.logLevel = (process.env.LLM_AUDIT_LOG_LEVEL as 'all' | 'errors' | 'none') || 'all';
    this.redactInput = process.env.LLM_AUDIT_REDACT_INPUT !== 'false';
    this.redactOutput = process.env.LLM_AUDIT_REDACT_OUTPUT !== 'false';
  }

  /**
   * Log LLM request
   */
  logRequest(options: {
    model: string;
    input: string;
    tenantId?: string;
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    auditId?: string;
    nodeId?: string;
    experimentId?: string;
    variantId?: string;
  }): string {
    if (!this.enabled || this.logLevel === 'none') {
      return '';
    }

    const logId = this.generateLogId();

    logger.info(
      {
        event: 'llm.request',
        logId,
        model: options.model,
        nodeId: options.nodeId,
        auditId: options.auditId,
        tenantId: options.tenantId,
        userId: options.userId,
        inputLength: options.input.length,
        inputHash: this.hashValue(options.input),
        inputPreview: '[SCRUBBED]',
      },
      'LLM request'
    );

    return logId;
  }

  /**
   * Log LLM response
   */
  logResponse(options: {
    logId: string;
    model: string;
    output?: string;
    inputTokens: number;
    outputTokens?: number;
    thoughtsTokens?: number;
    latencyMs: number;
    costUsd?: number;
    success: boolean;
    errorType?: string;
    errorMessage?: string;
    tenantId?: string;
    userId?: string;
    auditId?: string;
    nodeId?: string;
    experimentId?: string;
    variantId?: string;
  }): void {
    if (!this.enabled || this.logLevel === 'none') {
      return;
    }

    // Check for security issues
    const piiDetected = this.detectPii(options.output);
    const promptLeakDetected = this.detectPromptLeak(options.output);

    const log: LlmAuditLog = {
      timestamp: new Date().toISOString(),
      model: options.model,
      nodeId: options.nodeId,
      auditId: options.auditId,
      experimentId: options.experimentId,
      variantId: options.variantId,
      tenantId: options.tenantId,
      userId: options.userId,
      inputPreview: '[SCRUBBED]',
      inputHash: undefined,
      inputTokens: options.inputTokens,
      outputPreview: options.output ? '[SCRUBBED]' : undefined,
      outputHash: options.output ? this.hashValue(options.output) : undefined,
      outputTokens: options.outputTokens,
      thoughtsTokens: options.thoughtsTokens,
      latencyMs: options.latencyMs,
      costUsd: options.costUsd,
      success: options.success,
      errorType: options.errorType,
      errorMessage: options.errorMessage,
      piiDetected,
      promptLeakDetected,
    };

    if (options.success) {
      logger.info(
        {
          event: 'llm.response',
          logId: options.logId,
          correlationId: getCorrelationId(),
          traceId: getTraceId(),
          ...log,
        },
        'LLM response'
      );
    } else {
      logger.error(
        {
          event: 'llm.error',
          logId: options.logId,
          correlationId: getCorrelationId(),
          traceId: getTraceId(),
          ...log,
        },
        'LLM error'
      );
    }

    // Alert on security issues
    if (piiDetected) {
      logger.warn(
        {
          event: 'llm.security.pii',
          logId: options.logId,
          nodeId: options.nodeId,
          auditId: options.auditId,
        },
        'PII detected in LLM output'
      );
    }

    if (promptLeakDetected) {
      logger.error(
        {
          event: 'llm.security.prompt_leak',
          logId: options.logId,
          nodeId: options.nodeId,
          auditId: options.auditId,
        },
        'Prompt leakage detected in LLM output'
      );
    }
  }

  /**
   * Log rate limit hit
   */
  logRateLimit(options: {
    model: string;
    retryAfter?: number;
    tenantId?: string;
    nodeId?: string;
  }): void {
    logger.warn(
      {
        event: 'llm.ratelimit',
        model: options.model,
        retryAfter: options.retryAfter,
        tenantId: options.tenantId,
        nodeId: options.nodeId,
      },
      'LLM rate limit hit'
    );
  }

  /**
   * Log retry attempt
   */
  logRetry(options: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    reason: string;
    model: string;
    tenantId?: string;
    nodeId?: string;
  }): void {
    logger.info(
      {
        event: 'llm.retry',
        attempt: options.attempt,
        maxAttempts: options.maxAttempts,
        delayMs: options.delayMs,
        reason: options.reason,
        model: options.model,
        tenantId: options.tenantId,
        nodeId: options.nodeId,
      },
      'LLM retry attempt'
    );
  }

  /**
   * Log circuit breaker state change
   */
  logCircuitBreaker(options: {
    state: 'open' | 'closed' | 'half-open';
    model: string;
    failureCount?: number;
    tenantId?: string;
  }): void {
    logger.warn(
      {
        event: 'llm.circuit_breaker',
        state: options.state,
        model: options.model,
        failureCount: options.failureCount,
        tenantId: options.tenantId,
      },
      `Circuit breaker ${options.state}`
    );
  }

  /**
   * Get audit logs for a specific audit
   */
  async getAuditLogs(auditId: string, limit: number = 100): Promise<LlmAuditLog[]> {
    // In a real implementation, this would query a database
    // For now, we just log that the request was made
    logger.info({ auditId, limit }, 'Audit logs requested');
    return [];
  }

  /**
   * Detect PII in output
   */
  private detectPii(output?: string): boolean {
    if (!output) return false;

    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/;
    const ssnPattern = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/;

    return emailPattern.test(output) || phonePattern.test(output) || ssnPattern.test(output);
  }

  /**
   * Detect prompt leakage
   */
  private detectPromptLeak(output?: string): boolean {
    if (!output) return false;

    const patterns = [
      /\b(system\s+(message|prompt|instruction|role))\b/gi,
      /\b(you\s+are\s+(an?|a)\s+(helpful|AI|assistant))\b/gi,
      /\b(these\s+are\s+your\s+instructions)\b/gi,
      /\b(ignore|disregard)\s+(the|above|previous)\b/gi,
    ];

    return patterns.some((pattern) => pattern.test(output));
  }

  /**
   * Generate unique log ID
   */
  private generateLogId(): string {
    return `llm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private hashValue(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }

    return `hash_${Math.abs(hash)}`;
  }

  /**
   * Enable audit logging
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable audit logging
   */
  disable(): void {
    this.enabled = false;
  }
}

// Singleton instance
export const llmAuditLogger = new LlmAuditLogger();

export default llmAuditLogger;
