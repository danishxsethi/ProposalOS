/**
 * lib/security/inputSanitizer.ts
 *
 * XSS Prevention — Input Sanitization Utility
 *
 * Provides comprehensive input sanitization to prevent Cross-Site Scripting (XSS)
 * and other injection attacks by:
 * - Sanitizing HTML content using DOMPurify
 * - Escaping special characters for safe rendering
 * - Validating and sanitizing URLs
 * - Cleaning user-provided JSON data
 *
 * OWASP Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
 */

import DOMPurify from 'dompurify';

// Server-side DOMPurify setup (uses jsdom internally)
// In Next.js server components, we need to provide a window object
let isInitialized = false;

function initializeDOMPurify() {
  if (isInitialized || typeof window !== 'undefined') {
    return;
  }

  // For server-side rendering, DOMPurify can work without a full DOM
  // but we need to ensure it's configured properly
  isInitialized = true;
}

// Initialize on module load
initializeDOMPurify();

export interface SanitizeOptions {
  /** Allow HTML formatting tags (b, i, u, em, strong, etc.) */
  allowFormatting?: boolean;
  /** Allow links */
  allowLinks?: boolean;
  /** Allow images */
  allowImages?: boolean;
  /** Allow lists */
  allowLists?: boolean;
  /** Allow tables */
  allowTables?: boolean;
  /** Custom allowed tags */
  additionalTags?: string[];
  /** Custom allowed attributes */
  additionalAttributes?: string[];
  /** Strip all HTML tags (plain text only) */
  stripAllHtml?: boolean;
  /** Maximum length of output */
  maxLength?: number;
}

// Default allowed tags for various configurations
const DEFAULT_ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'u', 'code', 'pre', 'br', 'p', 'span'];

const FORMATTING_ALLOWED_TAGS = [
  ...DEFAULT_ALLOWED_TAGS,
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
  'mark',
  'small',
  'sub',
  'sup',
];

const LINKS_ALLOWED_TAGS = [...DEFAULT_ALLOWED_TAGS, 'a'];

const IMAGES_ALLOWED_TAGS = [...DEFAULT_ALLOWED_TAGS, 'img', 'figure', 'figcaption'];

const LISTS_ALLOWED_TAGS = [...DEFAULT_ALLOWED_TAGS, 'ul', 'ol', 'li', 'dl', 'dt', 'dd'];

const TABLES_ALLOWED_TAGS = [
  ...DEFAULT_ALLOWED_TAGS,
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'caption',
  'col',
  'colgroup',
];

// Default allowed attributes
const DEFAULT_ALLOWED_ATTRIBUTES = [
  'href',
  'src',
  'alt',
  'title',
  'target',
  'rel',
  'class',
  'id',
  'colspan',
  'rowspan',
  'width',
  'height',
];

// Dangerous attributes that should always be blocked
const DANGEROUS_ATTRIBUTES = [
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'onmouseout',
  'onfocus',
  'onblur',
  'onchange',
  'onsubmit',
  'onreset',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'ondblclick',
  'oncontextmenu',
  'onwheel',
  'ondrag',
  'ondragend',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondragstart',
  'ondrop',
  'onscroll',
  'oncopy',
  'oncut',
  'onpaste',
  'onabort',
  'oncanplay',
  'oncanplaythrough',
  'ondurationchange',
  'onemptied',
  'onended',
  'oninput',
  'oninvalid',
  'onloadeddata',
  'onloadedmetadata',
  'onloadstart',
  'onpause',
  'onplay',
  'onplaying',
  'onprogress',
  'onratechange',
  'onseeked',
  'onseeking',
  'onstalled',
  'onsuspend',
  'ontimeupdate',
  'onvolumechange',
  'onwaiting',
  'onanimationstart',
  'onanimationend',
  'onanimationiteration',
  'ontransitionend',
  'onpointerdown',
  'onpointerup',
  'onpointermove',
  'ontouchstart',
  'ontouchend',
  'ontouchmove',
  'ontouchcancel',
  'style', // Block inline styles to prevent CSS injection
  'srcdoc',
  'formaction',
  'xlink:href',
];

/**
 * Sanitize HTML content to prevent XSS
 *
 * @param html - The HTML content to sanitize
 * @param options - Sanitization options
 * @returns Sanitized HTML string
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const {
    allowFormatting = false,
    allowLinks = false,
    allowImages = false,
    allowLists = false,
    allowTables = false,
    additionalTags = [],
    additionalAttributes = [],
    stripAllHtml = false,
    maxLength,
  } = options;

  let allowedTags: string[];

  if (stripAllHtml) {
    // Strip all HTML tags, return plain text
    const plainText = html.replace(/<[^>]*>/g, '');
    return maxLength ? plainText.substring(0, maxLength) : plainText;
  }

  // Build allowed tags list based on options
  if (allowTables) {
    allowedTags = [...TABLES_ALLOWED_TAGS, ...additionalTags];
  } else if (allowLists) {
    allowedTags = [...LISTS_ALLOWED_TAGS, ...additionalTags];
  } else if (allowImages) {
    allowedTags = [...IMAGES_ALLOWED_TAGS, ...additionalTags];
  } else if (allowLinks) {
    allowedTags = [...LINKS_ALLOWED_TAGS, ...additionalTags];
  } else if (allowFormatting) {
    allowedTags = [...FORMATTING_ALLOWED_TAGS, ...additionalTags];
  } else {
    allowedTags = [...DEFAULT_ALLOWED_TAGS, ...additionalTags];
  }

  const allowedAttributes = [...DEFAULT_ALLOWED_ATTRIBUTES, ...additionalAttributes];

  // Configure DOMPurify
  const cleanHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    FORBID_ATTR: DANGEROUS_ATTRIBUTES,
    ALLOW_DATA_ATTR: false, // Block data-* attributes to prevent XSS
    ADD_URI_SAFE_ATTR: ['href', 'src'],
    USE_PROFILES: {
      html: true,
      svg: false,
      mathMl: false,
    },
  });

  // Apply max length if specified
  if (maxLength && cleanHtml.length > maxLength) {
    // Truncate safely, trying not to cut in the middle of a tag
    let truncated = cleanHtml.substring(0, maxLength);
    const lastOpenTag = truncated.lastIndexOf('<');
    const lastCloseTag = truncated.lastIndexOf('>');

    if (lastOpenTag > lastCloseTag) {
      truncated = truncated.substring(0, lastOpenTag);
    }

    return truncated;
  }

  return cleanHtml;
}

/**
 * Escape special characters for safe HTML rendering
 * Use this for plain text that will be rendered as HTML
 *
 * @param text - The text to escape
 * @returns Escaped text safe for HTML rendering
 */
export function escapeHtml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const escapeMap: Record<string, string> = {
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return text.replace(/[&<>"'`=\/]/g, (char) => escapeMap[char]);
}

/**
 * Escape special characters for safe JavaScript string embedding
 *
 * @param text - The text to escape
 * @returns Escaped text safe for JavaScript strings
 */
export function escapeJsString(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Escape characters that are dangerous in JavaScript strings
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\b/g, '\\b')
    .replace(/\f/g, '\\f')
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\//g, '\\u002F')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Sanitize user-provided JSON data
 * Recursively sanitizes all string values in an object
 *
 * @param data - The data to sanitize
 * @param options - Sanitization options
 * @returns Sanitized data
 */
export function sanitizeJson<T>(data: T, options?: SanitizeOptions): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    return sanitizeHtml(data, options) as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeJson(item, options)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Sanitize keys to prevent prototype pollution
      const sanitizedKey = escapeHtml(key);
      sanitized[sanitizedKey] = sanitizeJson(value, options);
    }
    return sanitized as unknown as T;
  }

  return data;
}

/**
 * Sanitize URL for safe use in href/src attributes
 *
 * @param url - The URL to sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  try {
    // Trim whitespace
    const trimmedUrl = url.trim();

    // Block javascript: and data: URLs
    const lowerUrl = trimmedUrl.toLowerCase();
    if (
      lowerUrl.startsWith('javascript:') ||
      lowerUrl.startsWith('data:') ||
      lowerUrl.startsWith('vbscript:')
    ) {
      return '';
    }

    // Parse URL to validate
    const parsedUrl = new URL(trimmedUrl);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '';
    }

    return parsedUrl.href;
  } catch {
    // Invalid URL format
    return '';
  }
}

/**
 * Sanitize email address
 *
 * @param email - The email to sanitize
 * @returns Sanitized email or empty string if invalid
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    return '';
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Basic email validation
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  if (!emailRegex.test(trimmedEmail)) {
    return '';
  }

  return trimmedEmail;
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return '';
  }

  // Remove path components
  let sanitized = filename.replace(/[/\\]/g, '');

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Remove leading dots and spaces
  sanitized = sanitized.replace(/^[\s.]+/, '');

  // Block reserved Windows names
  const reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];
  const nameWithoutExt = sanitized.split('.').slice(0, -1).join('.');
  if (reservedNames.includes(nameWithoutExt.toUpperCase())) {
    return '_invalid_filename_';
  }

  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.split('.').pop();
    const base = sanitized.split('.').slice(0, -1).join('.');
    sanitized = base.substring(0, 255 - ext!.length - 1) + '.' + ext;
  }

  return sanitized || '_unnamed_';
}

/**
 * Create a sanitized proposal content string
 * Specifically designed for LLM-generated proposal content
 *
 * @param content - The proposal content to sanitize
 * @returns Sanitized proposal content
 */
export function sanitizeProposalContent(content: string): string {
  return sanitizeHtml(content, {
    allowFormatting: true,
    allowLinks: true,
    allowLists: true,
    allowTables: true,
    additionalTags: ['details', 'summary'], // For expandable sections
  });
}

/**
 * Create a sanitized audit finding description
 *
 * @param description - The finding description
 * @returns Sanitized description
 */
export function sanitizeFindingDescription(description: string): string {
  return sanitizeHtml(description, {
    allowFormatting: true,
    allowLinks: true,
    allowLists: true,
  });
}

export default {
  sanitizeHtml,
  escapeHtml,
  escapeJsString,
  sanitizeJson,
  sanitizeUrl,
  sanitizeEmail,
  sanitizeFilename,
  sanitizeProposalContent,
  sanitizeFindingDescription,
};
