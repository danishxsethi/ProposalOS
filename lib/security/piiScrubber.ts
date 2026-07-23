import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

export class PiiScrubber {
    private static redactionMap = new Map<string, string>();
    private static counter = 0;

    static sanitize(text: string, businessName?: string): string {
        if (!FEATURE_FLAGS.GEMINI_31_PRO_ENABLED) return text;

        let sanitized = text;

        if (businessName && businessName.trim().length > 0) {
            const key = `[BUSINESS_NAME_REDACTED_${this.counter++}]`;
            this.redactionMap.set(key, businessName);
            const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const reg = new RegExp('\\b' + escapeRegExp(businessName) + '\\b', 'gi');
            sanitized = sanitized.replace(reg, key);
        }

        // Redact emails
        sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, (match) => {
            const key = `[EMAIL_REDACTED_${this.counter++}]`;
            this.redactionMap.set(key, match);
            return key;
        });

        // Redact typical US phone numbers format variants
        sanitized = sanitized.replace(/\b(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g, (match) => {
            const key = `[PHONE_REDACTED_${this.counter++}]`;
            this.redactionMap.set(key, match);
            return key;
        });

        // Periodically clear map to prevent memory leak since it's a static singleton
        if (this.redactionMap.size > 10000) this.redactionMap.clear();

        return sanitized;
    }

    static restore(text: string): string {
        if (!FEATURE_FLAGS.GEMINI_31_PRO_ENABLED) return text;
        let restored = text;
        // Search and replace all known redaction keys
        for (const [key, value] of this.redactionMap.entries()) {
            const escapedKey = key.replace(/[\[\]]/g, '\\$&');
            restored = restored.replace(new RegExp(escapedKey, 'g'), value);
        }
        return restored;
    }
}
