/**
 * lib/security/csrf.ts
 *
 * CSRF Protection — Token Generation and Validation
 *
 * Implements the Double Submit Cookie pattern for CSRF protection:
 * 1. Generate a random token and set it as an HTTP-only cookie
 * 2. Also return the token to the client for inclusion in request headers
 * 3. Validate that both the cookie and header match on state-changing requests
 *
 * OWASP Reference: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
 */

import { randomBytes, createHash } from 'crypto';

const CSRF_COOKIE_NAME = '__Host-csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

export interface CsrfTokenPair {
  token: string;
  hash: string;
}

/**
 * Generate a cryptographically secure CSRF token
 *
 * @returns Token pair with raw token and its hash
 */
export function generateCsrfToken(): CsrfTokenPair {
  // Generate 32 bytes of random data (256 bits of entropy)
  const randomBytes32 = randomBytes(32);

  // Create a hash for the cookie value (prevents XSS from reading raw token)
  const hash = createHash('sha256').update(randomBytes32).digest('hex');

  // The raw token is sent to the client for use in headers
  const token = randomBytes32.toString('hex');

  return { token, hash };
}

/**
 * Validate a CSRF token pair
 *
 * @param token - The token from the request header
 * @param cookieHash - The hash from the cookie
 * @returns True if valid, false otherwise
 */
export function validateCsrfToken(token: string | null, cookieHash: string | null): boolean {
  if (!token || !cookieHash) {
    return false;
  }

  try {
    // Re-hash the token and compare with the cookie hash
    const tokenHash = createHash('sha256').update(Buffer.from(token, 'hex')).digest('hex');

    // Constant-time comparison to prevent timing attacks
    return constantTimeCompare(tokenHash, cookieHash);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Get CSRF token from request headers
 *
 * @param headers - Request headers
 * @returns Token string or null if not present
 */
export function getCsrfTokenFromHeaders(headers: Headers): string | null {
  return headers.get(CSRF_HEADER_NAME);
}

/**
 * Get CSRF token hash from request cookies
 *
 * @param cookieHeader - Cookie header string
 * @returns Hash string or null if not present
 */
export function getCsrfHashFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${CSRF_COOKIE_NAME}=`)) {
      return cookie.substring(CSRF_COOKIE_NAME.length + 1);
    }
  }

  return null;
}

/**
 * Create Set-Cookie header for CSRF token
 *
 * Uses __Host- prefix for additional security:
 * - Must have Secure attribute
 * - Must have Path=/
 * - Cannot have Domain attribute
 *
 * @param hash - The token hash to set as cookie value
 * @returns Set-Cookie header value
 */
export function createCsrfCookie(hash: string): string {
  return `${CSRF_COOKIE_NAME}=${hash}; Path=/; Secure; SameSite=Strict; HttpOnly`;
}

/**
 * Middleware wrapper for CSRF protection
 *
 * For API routes that handle state-changing operations:
 *
 * @example
 * ```typescript
 * export async function POST(req: Request) {
 *   // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
 *   if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
 *     return handler(req);
 *   }
 *
 *   const csrfValid = validateCsrfRequest(req);
 *   if (!csrfValid) {
 *     return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
 *   }
 *
 *   return handler(req);
 * }
 * ```
 */
export function validateCsrfRequest(req: Request): boolean {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return true;
  }

  const token = getCsrfTokenFromHeaders(req.headers);
  const cookieHash = getCsrfHashFromCookie(req.headers.get('cookie'));

  return validateCsrfToken(token, cookieHash);
}

/**
 * Generate CSRF token and return with cookie header
 *
 * Use this to initialize CSRF protection for a session:
 *
 * @example
 * ```typescript
 * export async function GET(req: Request) {
 *   const { token, hash } = generateCsrfToken();
 *
 *   return NextResponse.json({ csrfToken: token }, {
 *     headers: {
 *       'Set-Cookie': createCsrfCookie(hash),
 *     },
 *   });
 * }
 * ```
 */
export function createCsrfResponse(): { token: string; cookieHeader: string } {
  const { token, hash } = generateCsrfToken();
  const cookieHeader = createCsrfCookie(hash);

  return { token, cookieHeader };
}

/**
 * CSRF error response
 */
export function createCsrfErrorResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'CSRF validation failed',
      code: 'CSRF_VALIDATION_ERROR',
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

export default {
  generateCsrfToken,
  validateCsrfToken,
  getCsrfTokenFromHeaders,
  getCsrfHashFromCookie,
  createCsrfCookie,
  validateCsrfRequest,
  createCsrfResponse,
  createCsrfErrorResponse,
};
