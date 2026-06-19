/**
 * PII Scrubber & Prompt Injection Defense
 *
 * Provides comprehensive sanitization of inputs before LLM processing:
 * - PII redaction (email, phone, SSN, credit cards)
 * - Prompt injection pattern detection
 * - XSS/HTML injection prevention
 * - Semantic injection attempt detection
 *
 * Security: Applied to ALL LLM inputs unconditionally (P0-4 fix)
 */

export interface SanitizationResult {
  sanitized: string;
  hadInjectionAttempt: boolean;
  injectionPatterns: string[];
  redactedCount: number;
}

export class PiiScrubber {
  // Injection pattern signatures (P0-1 fix)
  private static readonly INJECTION_PATTERNS = [
    // Direct instruction overrides
    /\b(ignore|disregard|forget|override|bypass)\s+(all\s+)?(previous|prior|above|below|instructions|rules)\b/gi,
    /\b(system|user|assistant)\s*(message|prompt|instruction|role)\s*:/gi,
    /\byou\s+are\s+now\s+(a|in|acting)/gi,
    /\bfrom\s+now\s+on\s*,?\s*(you|act)/gi,
    /\bact\s+as\s+(a|an|the)/gi,
    /\bplay\s+the\s+role\s+of/gi,
    /\bpretend\s+to\s+be/gi,
    /\bnew\s+(instructions?|rules?|directives?)/gi,

    // Output extraction attempts
    /\boutput\s+(your|the)\s+(prompt|instructions|system\s+message)/gi,
    /\bshow\s+(me|us)?\s+(your|the)\s+(prompt|instructions|rules)/gi,
    /\brepeat\s+(the\s+)?(text|words|content)\s+(above|before)/gi,
    /\bprint\s+(the\s+)?(prompt|instructions)/gi,
    /\breturn\s+(the\s+)?(original|first|system)/gi,

    // Encoding/escape attempts
    /\b(base64|rot13|hex|binary|url\s*encode)\s+(the\s+)?(output|text|prompt)/gi,
    /\bencode\s+(this|the\s+output|your\s+instructions)/gi,
    /\btranslate\s+to\s+(base64|hex|binary|morse)/gi,

    // Delimiter breaking
    /```[\s\S]*?```/g, // Code block injection
    /~~~[\s\S]*?~~~/g, // Alternative code blocks
    /<\?[\s\S]*?\?>/g, // PHP-style tags
    /<%[\s\S]*?%>/g, // ASP-style tags
    /\{\{[\s\S]*?\}\}/g, // Template injection

    // Unicode/homoglyph obfuscation
    /[\u200B-\u200D\uFEFF]/g, // Zero-width characters
    /[\u02B9-\u02BF]/g, // Modifier letters (homoglyphs)

    // SQL/NoSQL injection (if passed to LLM for processing)
    /\b(OR|AND)\s+['"]?\d+['"]?\s*=\s*['"]?\d+/gi,
    /\$\s*(where|or|and|nor)\s*:/gi,

    // Path traversal (if file operations possible)
    /\.\.[\\/]/g,

    // Command injection
    /[`$]\([^)]+\)/g, // $(command) or `command`
    /[;&|]\s*\w+/g, // Command chaining
  ];

  // PII patterns - always redacted
  private static readonly PII_PATTERNS = [
    // Email addresses
    { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },

    // US/Canada phone numbers
    {
      pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
      replacement: '[PHONE_REDACTED]',
    },

    // International phone (basic)
    { pattern: /\b\+[1-9]\d{6,14}\b/g, replacement: '[PHONE_REDACTED]' },

    // SSN (US)
    { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, replacement: '[SSN_REDACTED]' },

    // Credit card numbers (basic patterns)
    {
      pattern: /\b(?:4\d{3}|5[1-5]\d{2}|6011|3[47]\d{2})[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g,
      replacement: '[CC_REDACTED]',
    },

    // IP addresses
    { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },

    // AWS keys
    { pattern: /\b(AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g, replacement: '[AWS_KEY_REDACTED]' },

    // Stripe API keys (test and live)
    { pattern: /\bsk_(test|live)_[A-Za-z0-9]{16,}\b/g, replacement: '[STRIPE_KEY_REDACTED]' },
    // Stripe restricted/publishable keys
    { pattern: /\b(rk|pk)_(test|live)_[A-Za-z0-9]{16,}\b/g, replacement: '[STRIPE_KEY_REDACTED]' },
    // Stripe webhook secrets
    { pattern: /\bwhsec_[A-Za-z0-9]{16,}\b/g, replacement: '[STRIPE_WEBHOOK_REDACTED]' },

    // Private keys
    { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, replacement: '[PRIVATE_KEY_REDACTED]' },

    // Passwords in URLs
    { pattern: /:[^:@\/\s]+@(?=[^@\s]+\.)/g, replacement: ':[PASSWORD_REDACTED]@' },
  ];

  /**
   * Comprehensive sanitization with injection detection
   * P0-4 FIX: Now applied unconditionally (no feature flag)
   */
  static sanitize(
    text: string,
    options?: {
      businessName?: string;
      detectInjection?: boolean;
      redactPII?: boolean;
      maxLength?: number;
    }
  ): SanitizationResult {
    if (!text || typeof text !== 'string') {
      return { sanitized: '', hadInjectionAttempt: false, injectionPatterns: [], redactedCount: 0 };
    }

    const {
      businessName,
      detectInjection = true,
      redactPII = true,
      maxLength = 10000,
    } = options || {};

    let sanitized = text;
    const injectionPatterns: string[] = [];
    let redactedCount = 0;

    // Step 1: Normalize unicode and remove zero-width characters
    sanitized = sanitized.normalize('NFKC');
    sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
    sanitized = sanitized.replace(/[\u02B9-\u02BF]/g, '');

    // Step 2: Detect injection attempts (P0-1 fix)
    if (detectInjection) {
      for (const pattern of this.INJECTION_PATTERNS) {
        const matches = sanitized.match(pattern);
        if (matches && matches.length > 0) {
          injectionPatterns.push(`Pattern: ${pattern.toString()}`);
        }
      }
    }

    // Step 3: Remove dangerous injection patterns
    sanitized = sanitized.replace(/```[\s\S]*?```/g, '[CODE_BLOCK_REMOVED]');
    sanitized = sanitized.replace(/~~~[\s\S]*?~~~/g, '[CODE_BLOCK_REMOVED]');
    sanitized = sanitized.replace(/\{\{[\s\S]*?\}\}/g, '[TEMPLATE_REMOVED]');
    sanitized = sanitized.replace(/<\?[\s\S]*?\?>/g, '[PHP_TAG_REMOVED]');
    sanitized = sanitized.replace(/<%[\s\S]*?%>/g, '[ASP_TAG_REMOVED]');

    // Step 4: Remove prompt injection keywords
    sanitized = sanitized.replace(
      /\b(ignore|disregard|forget|override|bypass)\s+(all\s+)?(previous|prior|above|below|instructions|rules)\b/gi,
      '[INJECTION_BLOCKED]'
    );
    sanitized = sanitized.replace(
      /\b(system|user|assistant)\s*(message|prompt|instruction|role)\s*:/gi,
      '[ROLE_INJECTION_BLOCKED]'
    );
    sanitized = sanitized.replace(
      /\byou\s+are\s+now\s+(a|in|acting)/gi,
      '[PERSONA_INJECTION_BLOCKED]'
    );
    sanitized = sanitized.replace(/\bact\s+as\s+(a|an|the)/gi, '[ROLEPLAY_BLOCKED]');
    sanitized = sanitized.replace(
      /\boutput\s+(your|the)\s+(prompt|instructions|system\s+message)/gi,
      '[EXTRACTION_BLOCKED]'
    );
    sanitized = sanitized.replace(
      /\brepeat\s+(the\s+)?(text|words|content)\s+(above|before)/gi,
      '[REPETITION_BLOCKED]'
    );

    // Step 5: Remove dangerous characters
    sanitized = sanitized.replace(/[<>[\]{}]/g, '');

    // Step 6: PII Redaction (P0-4 fix - unconditional)
    if (redactPII) {
      for (const { pattern, replacement } of this.PII_PATTERNS) {
        const before = sanitized;
        sanitized = sanitized.replace(pattern, replacement);
        if (sanitized !== before) {
          redactedCount++;
        }
      }
    }

    // Step 7: Business name redaction (optional)
    if (businessName && businessName.trim().length > 2) {
      const escaped = this.escapeRegExp(businessName);
      const reg = new RegExp(`\\b${escaped}\\b`, 'gi');
      sanitized = sanitized.replace(reg, '[BUSINESS_NAME_REDACTED]');
    }

    // Step 8: Length capping with truncation marker
    if (sanitized.length > maxLength) {
      sanitized =
        sanitized.substring(0, maxLength) + '\n[TRUNCATED: input exceeded maximum length]';
    }

    // Step 9: Final cleanup
    sanitized = sanitized.trim();
    sanitized = sanitized.replace(/\n{3,}/g, '\n\n'); // Normalize excessive newlines

    return {
      sanitized,
      hadInjectionAttempt: injectionPatterns.length > 0,
      injectionPatterns,
      redactedCount,
    };
  }

  /**
   * Quick sanitization for simple strings (backward compatible)
   */
  static sanitizeSimple(text: string, businessName?: string): string {
    const result = this.sanitize(text, { businessName });
    return result.sanitized;
  }

  /**
   * Detect injection attempts without modifying text
   */
  static detectInjection(text: string): { detected: boolean; patterns: string[] } {
    const result = this.sanitize(text, { detectInjection: true, redactPII: false });
    return {
      detected: result.hadInjectionAttempt,
      patterns: result.injectionPatterns,
    };
  }

  /**
   * Redact only PII from text
   */
  static redactPII(text: string): { redacted: string; count: number } {
    const result = this.sanitize(text, { detectInjection: false, redactPII: true });
    return {
      redacted: result.sanitized,
      count: result.redactedCount,
    };
  }

  private static escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Export legacy static method for backward compatibility
 */
export const PiiScrubberLegacy = {
  sanitize: (text: string, businessName?: string): string => {
    return PiiScrubber.sanitizeSimple(text, businessName);
  },
};
