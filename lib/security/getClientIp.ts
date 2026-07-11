/**
 * Shared trusted-proxy-aware client IP extraction (P2-22).
 *
 * `X-Forwarded-For` is a comma-separated list where each hop APPENDS the address it
 * received the request from. Taking the first (left-most) entry — the previous bug in
 * this codebase — trusts a value the client fully controls (it can send any XFF header
 * it likes; only the LAST `TRUSTED_PROXY_HOP_COUNT` entries are appended by
 * infrastructure we trust).
 *
 * Deployment contract: this codebase runs behind exactly one trusted hop by default
 * (Cloud Run's own edge, which appends the real connecting IP as the last entry of the
 * chain it forwards). Ingress MUST NOT allow client-supplied `X-Forwarded-For` to be
 * appended after Cloud Run's own hop. If a load balancer or CDN is added in front of
 * Cloud Run, increase `TRUSTED_PROXY_HOP_COUNT` accordingly and confirm the new
 * infra-appended hop ordering.
 */

const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_PATTERN = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);
// Reasonably permissive IPv6 shape check (not a full RFC validator) — good enough to
// reject obviously malformed/injected values without over-engineering a parser.
const IPV6_PATTERN = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

function isPlausibleIp(value: string): boolean {
  if (!value) return false;
  return IPV4_PATTERN.test(value) || IPV6_PATTERN.test(value);
}

function trustedProxyHopCount(): number {
  const raw = process.env.TRUSTED_PROXY_HOP_COUNT;
  const parsed = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Returns the client IP trusted infrastructure actually observed, or 'unknown' if it
 * cannot be determined safely. Never trusts more of the X-Forwarded-For chain than the
 * configured number of trusted hops.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');

  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);

    const hopCount = trustedProxyHopCount();
    // The Nth-from-the-right entry is the one appended by our trusted edge; anything to
    // its left may be client-supplied and must not be trusted.
    const candidateIndex = hops.length - hopCount;
    const candidate = hops[candidateIndex];

    if (candidate && isPlausibleIp(candidate)) {
      return candidate;
    }
    // Chain shorter than expected or malformed entry — do not fall back to an
    // untrusted (client-controlled) hop; fail safe instead.
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp && isPlausibleIp(realIp)) {
    return realIp;
  }

  return 'unknown';
}
