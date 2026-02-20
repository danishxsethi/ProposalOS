import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

export class PiiScrubber {
    static sanitize(text: string, businessName?: string): string {
        if (!FEATURE_FLAGS.GEMINI_31_PRO_ENABLED) return text;

        let sanitized = text;

        if (businessName && businessName.trim().length > 0) {
            // Escape regex special chars in business name
            const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reg = new RegExp('\\b' + escapeRegExp(businessName) + '\\b', 'gi');
            sanitized = sanitized.replace(reg, '[BUSINESS_NAME_REDACTED]');
        }

        // Redact emails
        sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

        // Redact typical US phone numbers format variants
        sanitized = sanitized.replace(/\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g, '[PHONE_REDACTED]');

        return sanitized;
    }
}
