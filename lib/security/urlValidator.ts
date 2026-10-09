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

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

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
  /** Exact OS-resolved IPs that passed validation; safeFetch pins sockets to them. */
  resolvedAddresses?: ResolvedAddress[];
}

/**
 * Check if an IP address is in a blocked range
 */
function isIpBlocked(ip: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  // Only globally routable unicast addresses are valid fetch destinations.
  // This also blocks CGNAT, documentation, benchmarking, multicast,
  // unspecified, reserved, and IPv4-mapped IPv6 ranges.
  return ip.range() !== 'unicast';
}

/**
 * Validate hostname/IP to prevent SSRF
 */
async function validateHost(
  host: string
): Promise<{ valid: boolean; error?: string; addresses?: ResolvedAddress[] }> {
  // Check against blocked hostnames
  const lowerHost = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    BLOCKED_HOSTNAMES.some((blocked) => lowerHost === blocked || lowerHost.endsWith(`.${blocked}`))
  ) {
    return { valid: false, error: `Blocked hostname: ${host}` };
  }

  // Try to parse as IP address
  try {
    let ip: ipaddr.IPv4 | ipaddr.IPv6;

    if (ipaddr.IPv6.isValid(lowerHost)) {
      ip = ipaddr.parse(lowerHost) as ipaddr.IPv6;
    } else if (ipaddr.IPv4.isValid(lowerHost)) {
      ip = ipaddr.parse(lowerHost) as ipaddr.IPv4;
    } else {
      // Not an IP, will be resolved via DNS
      return await validateDns(lowerHost);
    }

    if (isIpBlocked(ip)) {
      return { valid: false, error: `Blocked IP address: ${host}` };
    }

    return {
      valid: true,
      addresses: [{ address: ip.toString(), family: ip.kind() === 'ipv4' ? 4 : 6 }],
    };
  } catch {
    // Invalid IP format, will be validated as hostname
    return await validateDns(lowerHost);
  }
}

/**
 * Validate hostname by resolving DNS and checking resulting IPs
 */
async function validateDns(
  hostname: string
): Promise<{ valid: boolean; error?: string; addresses?: ResolvedAddress[] }> {
  const dns = await import('node:dns').then((m) => m.promises);

  try {
    // Resolve with the OS lookup used by Node connections, then pass this exact
    // answer set to safeFetch so connection setup cannot perform a second lookup.
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });

    if (addresses.length === 0) {
      return { valid: false, error: `No DNS records found for: ${hostname}` };
    }

    // Check every A/AAAA address; reject mixed public/private answer sets.
    const resolvedAddresses: ResolvedAddress[] = [];
    for (const record of addresses) {
      let ip: ipaddr.IPv4 | ipaddr.IPv6;

      try {
        if (ipaddr.IPv6.isValid(record.address)) {
          ip = ipaddr.parse(record.address) as ipaddr.IPv6;
        } else if (ipaddr.IPv4.isValid(record.address)) {
          ip = ipaddr.parse(record.address) as ipaddr.IPv4;
        } else {
          return { valid: false, error: `DNS returned an invalid IP address for: ${hostname}` };
        }

        if (isIpBlocked(ip)) {
          return {
            valid: false,
            error: `DNS resolution blocked: ${hostname} resolves to blocked IP ${record.address}`,
          };
        }
      } catch {
        return { valid: false, error: `DNS returned an invalid IP address for: ${hostname}` };
      }

      resolvedAddresses.push({
        address: ip.toString(),
        family: ip.kind() === 'ipv4' ? 4 : 6,
      });
    }

    return { valid: true, addresses: resolvedAddresses };
  } catch {
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
  const sanitizedUrl = parsedUrl.toString();

  return {
    isValid: true,
    sanitizedUrl,
    resolvedAddresses: hostValidation.addresses,
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
