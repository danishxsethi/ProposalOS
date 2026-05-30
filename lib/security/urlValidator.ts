/**
 * lib/security/urlValidator.ts
 *
 * SSRF Prevention — URL Validation Utility
 *
 * Validates URLs to prevent Server-Side Request Forgery (SSRF) attacks by:
 * - Blocking internal/private IP ranges
 * - Allowing only HTTPS scheme
 * - Preventing DNS rebinding attacks
 * - Blocking localhost and link-local addresses
 *
 * OWASP Reference: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import ipaddr from 'ipaddr.js';

// IP ranges that should be blocked to prevent SSRF
const BLOCKED_IP_RANGES = [
  // IPv4 private ranges
  { range: ipaddr.parse('10.0.0.0'), mask: 8 }, // 10.0.0.0/8
  { range: ipaddr.parse('172.16.0.0'), mask: 12 }, // 172.16.0.0/12
  { range: ipaddr.parse('192.168.0.0'), mask: 16 }, // 192.168.0.0/16
  { range: ipaddr.parse('127.0.0.0'), mask: 8 }, // 127.0.0.0/8 (loopback)
  { range: ipaddr.parse('0.0.0.0'), mask: 8 }, // 0.0.0.0/8
  { range: ipaddr.parse('169.254.0.0'), mask: 16 }, // 169.254.0.0/16 (link-local)
  { range: ipaddr.parse('224.0.0.0'), mask: 4 }, // 224.0.0.0/4 (multicast)
  { range: ipaddr.parse('240.0.0.0'), mask: 4 }, // 240.0.0.0/4 (reserved)
  // IPv6 private ranges
  { range: ipaddr.parse('::1'), mask: 128 }, // ::1/128 (loopback)
  { range: ipaddr.parse('fe80::'), mask: 10 }, // fe80::/10 (link-local)
  { range: ipaddr.parse('fc00::'), mask: 7 }, // fc00::/7 (unique local)
  { range: ipaddr.parse('::ffff:0:0'), mask: 96 }, // ::ffff:0:0/96 (IPv4-mapped)
];

// Special hostnames that should be blocked
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'internal',
  'metadata.google.internal',
  'metadata',
  '169.254.169.254', // Cloud metadata service
  'metadata.k8s.local',
];

export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedUrl?: string;
}

/**
 * Check if an IP address is in a blocked range
 */
function isIpBlocked(ip: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  for (const blocked of BLOCKED_IP_RANGES) {
    if (ip.kind() === blocked.range.kind() && ip.match(blocked.range, blocked.mask)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate hostname/IP to prevent SSRF
 */
async function validateHost(host: string): Promise<{ valid: boolean; error?: string }> {
  // Check against blocked hostnames
  const lowerHost = host.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.some((blocked) => lowerHost === blocked || lowerHost.endsWith(`.${blocked}`))
  ) {
    return { valid: false, error: `Blocked hostname: ${host}` };
  }

  // Try to parse as IP address
  try {
    let ip: ipaddr.IPv4 | ipaddr.IPv6;

    if (ipaddr.IPv6.isValid(host)) {
      ip = ipaddr.parse(host) as ipaddr.IPv6;
      // Handle IPv4-mapped IPv6 addresses
      if (ip.isIPv4MappedAddress()) {
        ip = ip.toIPv4Address();
      }
    } else if (ipaddr.IPv4.isValid(host)) {
      ip = ipaddr.parse(host) as ipaddr.IPv4;
    } else {
      // Not an IP, will be resolved via DNS
      return await validateDns(host);
    }

    if (isIpBlocked(ip)) {
      return { valid: false, error: `Blocked IP address: ${host}` };
    }

    return { valid: true };
  } catch {
    // Invalid IP format, will be validated as hostname
    return await validateDns(host);
  }
}

/**
 * Validate hostname by resolving DNS and checking resulting IPs
 */
async function validateDns(hostname: string): Promise<{ valid: boolean; error?: string }> {
  const dns = await import('dns').then((m) => m.promises);

  try {
    // Resolve all addresses for the hostname
    const addresses = await dns.resolve(hostname);

    if (addresses.length === 0) {
      return { valid: false, error: `No DNS records found for: ${hostname}` };
    }

    // Check each resolved IP
    for (const addr of addresses) {
      let ip: ipaddr.IPv4 | ipaddr.IPv6;

      try {
        if (ipaddr.IPv6.isValid(addr)) {
          ip = ipaddr.parse(addr) as ipaddr.IPv6;
          if (ip.isIPv4MappedAddress()) {
            ip = ip.toIPv4Address();
          }
        } else if (ipaddr.IPv4.isValid(addr)) {
          ip = ipaddr.parse(addr) as ipaddr.IPv4;
        } else {
          continue;
        }

        if (isIpBlocked(ip)) {
          return {
            valid: false,
            error: `DNS resolution blocked: ${hostname} resolves to blocked IP ${addr}`,
          };
        }
      } catch {
        continue;
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `DNS resolution failed for: ${hostname}`,
    };
  }
}

/**
 * Validate a URL for SSRF prevention
 *
 * @param url - The URL to validate
 * @param options - Validation options
 * @returns Validation result with isValid flag and optional error/sanitizedUrl
 */
export async function validateUrl(
  url: string,
  options: {
    allowHttp?: boolean; // Allow HTTP (default: false, HTTPS only)
    requireHttps?: boolean; // Require HTTPS (default: true)
  } = {}
): Promise<UrlValidationResult> {
  const { allowHttp = false, requireHttps = true } = options;

  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }

  // Enforce HTTPS scheme (default)
  if (requireHttps && parsedUrl.protocol !== 'https:') {
    return { isValid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // Block HTTP if not explicitly allowed
  if (!allowHttp && parsedUrl.protocol === 'http:') {
    return { isValid: false, error: 'HTTP URLs are not allowed. Use HTTPS.' };
  }

  // Block other dangerous schemes
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      isValid: false,
      error: `Invalid URL scheme: ${parsedUrl.protocol}. Only http and https are allowed.`,
    };
  }

  // Validate the host
  const hostValidation = await validateHost(parsedUrl.hostname);
  if (!hostValidation.valid) {
    return { isValid: false, error: hostValidation.error };
  }

  // Block URLs with embedded credentials
  if (parsedUrl.username || parsedUrl.password) {
    return { isValid: false, error: 'URLs with embedded credentials are not allowed' };
  }

  // Block URLs with ports in dangerous ranges
  const port = parsedUrl.port
    ? parseInt(parsedUrl.port, 10)
    : parsedUrl.protocol === 'https:'
      ? 443
      : 80;

  const blockedPorts = [
    22, // SSH
    23, // Telnet
    25, // SMTP
    53, // DNS
    110, // POP3
    143, // IMAP
    445, // SMB
    3306, // MySQL
    3389, // RDP
    5432, // PostgreSQL
    6379, // Redis
    8080, // Common proxy
    9000, // Common internal
    27017, // MongoDB
  ];

  if (blockedPorts.includes(port)) {
    return { isValid: false, error: `Port ${port} is blocked for security reasons` };
  }

  // Return sanitized URL (rebuilt to ensure clean format)
  const sanitizedUrl = `https://${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;

  return {
    isValid: true,
    sanitizedUrl,
  };
}

/**
 * Validate multiple URLs (batch validation)
 */
export async function validateUrls(
  urls: string[],
  options?: { allowHttp?: boolean; requireHttps?: boolean }
): Promise<Map<string, UrlValidationResult>> {
  const results = new Map<string, UrlValidationResult>();

  for (const url of urls) {
    const result = await validateUrl(url, options);
    results.set(url, result);
  }

  return results;
}

/**
 * Middleware wrapper for API routes to validate URL parameters
 *
 * @example
 * ```typescript
 * export async function POST(req: Request) {
 *   const { url } = await req.json();
 *
 *   const validation = await validateUrl(url);
 *   if (!validation.isValid) {
 *     return NextResponse.json({ error: validation.error }, { status: 400 });
 *   }
 *
 *   // Safe to use validation.sanitizedUrl
 * }
 * ```
 */
export function createUrlValidator(options?: { allowHttp?: boolean; requireHttps?: boolean }) {
  return async (url: string): Promise<UrlValidationResult> => {
    return validateUrl(url, options);
  };
}

export default validateUrl;
