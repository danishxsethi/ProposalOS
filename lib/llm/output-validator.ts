/**
 * LLM Output Validation Middleware (P1-3 fix)
 *
 * Validates all LLM outputs before they are shown to users or prospects:
 * - Content filtering for offensive/harmful output
 * - Legal risk detection (promises, guarantees, claims)
 * - Length and format guards
 * - Schema validation for structured outputs
 *
 * Security: Applied to ALL LLM outputs unconditionally
 */

import { z } from 'zod';

export interface ValidationResult {
  valid: boolean;
  issues: OutputIssue[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  sanitizedContent?: string;
}

export interface OutputIssue {
  type: IssueType;
  message: string;
  location?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export type IssueType =
  | 'offensive_content'
  | 'discriminatory_language'
  | 'legal_risk'
  | 'unsubstantiated_claim'
  | 'excessive_length'
  | 'format_violation'
  | 'pii_leak'
  | 'prompt_leak'
  | 'hallucination'
  | 'encoding_anomaly';

// Patterns for detecting problematic content
const PROBLEMATIC_PATTERNS = {
  // Offensive/discriminatory language
  offensive: [
    /\b(stupid|idiot|dumb|moron|retard|dumbass|bullshit|crap)\b/gi,
    /\b(hate|despise|loathe|disgust)\b/gi,
    /\b(should\s+(be\s+)?(ashamed|embarrassed))\b/gi,
  ],

  // Legal risk - promises and guarantees
  legalRisk: [
    /\b(guarantee|guaranteed|promises?|warrants?|assures?)\b/gi,
    /\b(will\s+(100%|definitely|certainly|always))\b/gi,
    /\b(risk[- ]?free|no[- ]?risk|zero[- ]?risk)\b/gi,
    /\b(money[- ]?back|refund\s+guarantee)\b/gi,
    /\b(#1|best|top[- ]?rated|leading)\b/gi,
  ],

  // Unsubstantiated numeric claims
  unsubstantiatedClaims: [
    /\b(increase|boost|improve)\s+(your\s+)?(sales|revenue|conversions|traffic)\s+by\s+(\d+)%/gi,
    /\b(see\s+results\s+in|within)\s+(\d+)\s+(days?|weeks?|months?)/gi,
    /\b(\d+)%\s+(of\s+)?(businesses?|companies?|clients?)\s+(will|can)/gi,
  ],

  // PII patterns that shouldn't appear in output
  piiLeak: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, // SSN
    /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g, // Credit card
  ],

  // Prompt leakage indicators
  promptLeak: [
    /\b(system\s+(message|prompt|instruction|role))\b/gi,
    /\b(you\s+are\s+(an?|a)\s+(helpful|AI|assistant))\b/gi,
    /\b(these\s+are\s+your\s+instructions)\b/gi,
    /\b(ignore|disregard)\s+(the|above|previous)\b/gi,
  ],

  // Encoding anomalies (potential injection artifacts)
  encodingAnomaly: [
    /[\u200B-\u200D\uFEFF]/g, // Zero-width characters
    /[\u02B9-\u02BF]/g, // Modifier letters
    /&#x[0-9a-fA-F]+;/g, // HTML entities
    /%[0-9a-fA-F]{2}/g, // URL encoding in odd places
  ],
};

// Schema for validating structured outputs
export const StructuredOutputSchema = z
  .object({
    content: z.string().min(1),
    metadata: z
      .object({
        model: z.string().optional(),
        timestamp: z.string().optional(),
        confidence: z.number().min(0).max(1).optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Validate LLM output before displaying to users
 * P1-3 FIX: Comprehensive output validation
 */
export function validateOutput(
  content: string,
  options?: {
    checkOffensive?: boolean;
    checkLegalRisk?: boolean;
    checkPII?: boolean;
    checkPromptLeak?: boolean;
    maxLength?: number;
    expectedSchema?: z.ZodSchema;
  }
): ValidationResult {
  const {
    checkOffensive = true,
    checkLegalRisk = true,
    checkPII = true,
    checkPromptLeak = true,
    maxLength = 50000,
    expectedSchema,
  } = options || {};

  const issues: OutputIssue[] = [];
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  let sanitizedContent = content;

  // Check length
  if (content.length > maxLength) {
    issues.push({
      type: 'excessive_length',
      message: `Output exceeds maximum length (${content.length} > ${maxLength})`,
      severity: 'medium',
    });
    severity = 'medium';
    sanitizedContent = content.substring(0, maxLength) + '\n[TRUNCATED]';
  }

  // Check for offensive content
  if (checkOffensive) {
    for (const pattern of PROBLEMATIC_PATTERNS.offensive) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          type: 'offensive_content',
          message: `Potentially offensive language detected: "${matches.slice(0, 3).join(', ')}"`,
          severity: 'high',
        });
        severity = severity === 'critical' ? 'critical' : 'high';

        // Sanitize
        for (const match of matches) {
          sanitizedContent = sanitizedContent.replace(
            new RegExp(escapeRegExp(match), 'gi'),
            '[REDACTED]'
          );
        }
      }
    }
  }

  // Check for legal risk
  if (checkLegalRisk) {
    for (const pattern of PROBLEMATIC_PATTERNS.legalRisk) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          type: 'legal_risk',
          message: `Potentially legally problematic language: "${matches.slice(0, 2).join(', ')}"`,
          severity: 'high',
          location: 'legal_compliance',
        });
        severity = severity === 'critical' ? 'critical' : 'high';
      }
    }
  }

  // Check for unsubstantiated claims
  for (const pattern of PROBLEMATIC_PATTERNS.unsubstantiatedClaims) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      issues.push({
        type: 'unsubstantiated_claim',
        message: `Numeric claim that may require substantiation: "${matches[0]}"`,
        severity: 'medium',
        location: 'claims_verification',
      });
    }
  }

  // Check for PII leakage
  if (checkPII) {
    for (const pattern of PROBLEMATIC_PATTERNS.piiLeak) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          type: 'pii_leak',
          message: `Potential PII detected in output (${matches.length} instances)`,
          severity: 'critical',
          location: 'data_protection',
        });
        severity = 'critical';

        // Redact PII
        sanitizedContent = sanitizedContent.replace(pattern, '[REDACTED]');
      }
    }
  }

  // Check for prompt leakage
  if (checkPromptLeak) {
    for (const pattern of PROBLEMATIC_PATTERNS.promptLeak) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        issues.push({
          type: 'prompt_leak',
          message: `Potential system prompt leakage detected`,
          severity: 'critical',
          location: 'security',
        });
        severity = 'critical';
      }
    }
  }

  // Check for encoding anomalies
  for (const pattern of PROBLEMATIC_PATTERNS.encodingAnomaly) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      issues.push({
        type: 'encoding_anomaly',
        message: `Suspicious encoding patterns detected (${matches.length} instances)`,
        severity: 'medium',
        location: 'content_integrity',
      });

      // Remove anomalous characters
      sanitizedContent = sanitizedContent.replace(pattern, '');
    }
  }

  // Validate schema if provided
  if (expectedSchema) {
    try {
      const parsed = JSON.parse(content);
      const result = expectedSchema.safeParse(parsed);
      if (!result.success) {
        issues.push({
          type: 'format_violation',
          message: `Output does not match expected schema: ${result.error.errors.map((e) => e.message).join(', ')}`,
          severity: 'high',
          location: 'schema_validation',
        });
        severity = severity === 'critical' ? 'critical' : 'high';
      }
    } catch (e) {
      issues.push({
        type: 'format_violation',
        message: `Output is not valid JSON: ${String(e)}`,
        severity: 'high',
        location: 'json_parsing',
      });
      severity = severity === 'critical' ? 'critical' : 'high';
    }
  }

  return {
    valid: issues.length === 0 || issues.every((i) => i.severity === 'low'),
    issues,
    severity,
    sanitizedContent: issues.length > 0 ? sanitizedContent : content,
  };
}

/**
 * Validate and potentially block output based on severity
 */
export function validateAndFilter(
  content: string,
  options?: {
    blockOnCritical?: boolean;
    blockOnHigh?: boolean;
    returnSanitized?: boolean;
  } & Parameters<typeof validateOutput>[1]
): { allowed: boolean; content: string; issues: OutputIssue[] } {
  const {
    blockOnCritical = true,
    blockOnHigh = false,
    returnSanitized = true,
    ...validateOptions
  } = options || {};

  const result = validateOutput(content, validateOptions);

  // Determine if output should be blocked
  let allowed = true;
  if (blockOnCritical && result.severity === 'critical') {
    allowed = false;
  }
  if (blockOnHigh && (result.severity === 'high' || result.severity === 'critical')) {
    allowed = false;
  }

  return {
    allowed,
    content: allowed
      ? returnSanitized
        ? result.sanitizedContent || content
        : content
      : getBlockedResponse(result),
    issues: result.issues,
  };
}

/**
 * Get appropriate response when content is blocked
 */
function getBlockedResponse(result: ValidationResult): string {
  if (result.severity === 'critical') {
    if (result.issues.some((i) => i.type === 'prompt_leak')) {
      return "I'm here to help with your questions about our services. Could you rephrase your question?";
    }
    if (result.issues.some((i) => i.type === 'pii_leak')) {
      return 'I need to review this response for accuracy. A team member will follow up shortly.';
    }
    return "I need to ensure I'm providing accurate information. Let me connect you with a specialist.";
  }

  if (result.severity === 'high') {
    return (
      'Let me rephrase that to ensure clarity. ' +
      (result.sanitizedContent?.substring(0, 200) || '')
    );
  }

  return result.sanitizedContent || '';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Middleware wrapper for Express/Next.js API routes
 */
export function createOutputValidator(options?: Parameters<typeof validateAndFilter>[1]) {
  return function validateOutputMiddleware(content: string): {
    valid: boolean;
    content: string;
    blocked: boolean;
  } {
    const result = validateAndFilter(content, options);
    return {
      valid: result.allowed,
      content: result.content,
      blocked: !result.allowed,
    };
  };
}

// Export for use in other modules
export default {
  validateOutput,
  validateAndFilter,
  createOutputValidator,
  PROBLEMATIC_PATTERNS,
};
