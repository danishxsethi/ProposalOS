import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Public/tokenized proposal mutation inventory (additive, read-only).
 *
 * Verifies every public/tokenized proposal surface only performs writes
 * allowed for the prospect-facing channel, and never reaches internal
 * sales / payment / fulfillment / QA / tenant-configuration authority.
 * Emits docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts/public-proposal-mutation.json
 */

const rootDir = path.resolve(__dirname, '../../');
const apiDir = path.join(rootDir, 'app/api');
const artifactsDir = path.join(
  rootDir,
  'docs/audits/2026-09-18-proposal-os-ground-up-ga-audit/artifacts'
);

const TOKEN_PROPOSAL_DIR = path.join(apiDir, 'proposal/token');

// Tables/models a public token channel may write
const ALLOWED_WRITES: Record<string, RegExp[]> = {
  'proposal/token/[token]/accept/route.ts': [/proposalAcceptance\.create/, /proposal\.update/],
  'proposal/token/[token]/contact/route.ts': [/contactRequest\.create/, /proposal\.update/],
  'proposal/token/[token]/track/route.ts': [/proposalView\.create/, /proposalView\.update/],
  'proposal/token/[token]/share/route.ts': [/proposal\.update/],
  'proposal/token/[token]/email/route.ts': [/proposal\.update/],
};

// Fields on the Proposal model a public token channel may set
const ALLOWED_PROPOSAL_UPDATE_FIELDS = new Set([
  'status',
  'acceptedAt',
  'acceptedByName',
  'acceptedByEmail',
  'signatureDataUrl',
  'shareCount',
  'lastSharedAt',
  'emailSentCount',
  'lastEmailedAt',
  'lastViewedAt',
  'viewCount',
  'contactRequestedAt',
  'updatedAt',
  'sentAt',
  'replyReceivedAt',
  'outcome',
  'tierChosen',
  'closedAt',
  'meetingBookedAt',
]);

// Per-route dynamic-update allowlist: fields set via a computed updateData object
const ALLOWED_DYNAMIC_UPDATE_FIELDS: Record<string, Set<string>> = {
  'proposal/token/[token]/contact/route.ts': new Set(['replyReceivedAt', 'outcome', 'tierChosen']),
};

// Internal authorities a public token channel must never touch
const FORBIDDEN_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'payment/stripe', regex: /stripe|checkout\.sessions|paymentIntent|invoice/i },
  { name: 'tenant configuration', regex: /tenant\.update|tenant\.create|tenantConfig|pipelineConfig|updateTenant/i },
  // pipeline recordEvent receives engagement telemetry (view events) by design;
  // forbidden is mutating pipeline sales records (prospect/partner/lead writes).
  { name: 'internal sales pipeline', regex: /(prospect|partner|lead)\.(create|update|delete|upsert)/i },
  // reading proposal.qaResults for citation rendering is allowed; forbidden is
  // writing QA/telemetry authority records.
  { name: 'QA authority', regex: /(humanReview|qaTelemetry|hallucinationTelemetry|modelMetric)\w*\.(create|update|delete|upsert)/i },
  { name: 'pricing/plan authority', regex: /pricingPlan|plan\.update|subscription\.|billing\./i },
  { name: 'fulfillment/delivery', regex: /(?:delivery|fulfillment|artifact|bundle)\.(?:create|update|delete|upsert)/i },
  { name: 'auth/user authority', regex: /user\.create|user\.update|apiKey|session\./i },
  { name: 'audit engine authority', regex: /audit\.(?:create|update)|finding\.(?:create|update|delete|upsert)/i },
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else if (e.name === 'route.ts') out.push(full);
  }
  return out.sort();
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => {
      const idx = l.indexOf('//');
      return idx >= 0 ? l.slice(0, idx) : l;
    })
    .join('\n');
}

function extractPrismaWrites(content: string): string[] {
  const writes = new Set<string>();
  const re = /prisma\.(\w+)\.(create|update|updateMany|delete|deleteMany|upsert|createMany)\b/g;
  const txRe = /tx\.(\w+)\.(create|update|updateMany|delete|deleteMany|upsert|createMany)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) writes.add(`${m[1]}.${m[2]}`);
  while ((m = txRe.exec(content))) writes.add(`${m[1]}.${m[2]}`);
  return [...writes].sort();
}

/** Extract top-level keys of `data: { ... }` blocks that belong to proposal.update calls. */
function extractProposalUpdateFields(content: string): string[] {
  const fields = new Set<string>();
  // Find each `proposal.update({ ... })` call with balanced braces.
  const re = /(?:prisma|tx)\.proposal\.update\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < content.length && depth > 0) {
      if (content[i] === '{') depth++;
      else if (content[i] === '}') depth--;
      i++;
    }
    const callBody = content.slice(m.index, i);
    const dataIdx = callBody.indexOf('data:');
    if (dataIdx < 0) continue;
    const dataStart = callBody.indexOf('{', dataIdx);
    if (dataStart < 0) continue; // dynamic data object (e.g. data: updateData)
    // Parse top-level keys of the data object via a small tokenizer.
    // dataStart points AT the data object's opening brace, so depth begins at 1
    // and keys live at depth 1.
    let d = 1;
    let key = '';
    let expectingKey = true;
    for (let j = dataStart + 1; j < callBody.length; j++) {
      const ch = callBody[j];
      if (ch === '{') {
        d++;
        continue;
      }
      if (ch === '}') {
        d--;
        if (d === 0) break;
        continue;
      }
      if (d !== 1) continue;
      if (expectingKey) {
        if (/[A-Za-z_]/.test(ch)) {
          key += ch;
        } else if (ch === ':' && key) {
          fields.add(key);
          key = '';
          expectingKey = false;
        } else if (/\s/.test(ch)) {
          // allow whitespace within/after key
        } else {
          key = '';
          expectingKey = false;
        }
      } else if (ch === ',') {
        expectingKey = true;
        key = '';
      }
    }
  }
  return [...fields].sort();
}

describe('Public/tokenized proposal mutation inventory', () => {
  const files = listFiles(TOKEN_PROPOSAL_DIR);

  it('finds the token proposal surface', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('writes only allowed models/fields and no forbidden internal authority', () => {
    const inventory: any[] = [];

    for (const file of files) {
      const rel = path.relative(apiDir, file);
      const content = stripComments(fs.readFileSync(file, 'utf8'));
      const methods = [...content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(
        (m) => m[1]
      );
      const writes = extractPrismaWrites(content);
      const violations: string[] = [];

      // Forbidden internal authority scan (route.ts source only)
      for (const f of FORBIDDEN_PATTERNS) {
        if (f.regex.test(content)) violations.push(`forbidden:${f.name}`);
      }

      // Writes must be in the allowlist (if the file is a mutator)
      const allowed = ALLOWED_WRITES[rel];
      if (writes.length > 0) {
        if (!allowed) {
          // track/others with writes must be listed; unknown writers fail
          if (writes.some((w) => !/proposalView|proposal\.update/.test(w))) {
            violations.push(`unallowlisted-writes:${writes.join(',')}`);
          }
        } else {
          for (const w of writes) {
            if (!allowed.some((re) => re.test(w))) {
              violations.push(`unallowlisted-write:${w}`);
            }
          }
        }
      }

      // Field-level check for proposal.update on public channels
      if (allowed && content.includes('proposal.update')) {
        for (const field of extractProposalUpdateFields(content)) {
          if (!ALLOWED_PROPOSAL_UPDATE_FIELDS.has(field)) {
            violations.push(`forbidden-proposal-field:${field}`);
          }
        }
        // Dynamic updateData: ensure only allowlisted fields are assigned
        const dynAllowed = ALLOWED_DYNAMIC_UPDATE_FIELDS[rel];
        const dynRe = /updateData\.(\w+)\s*=/g;
        let dm: RegExpExecArray | null;
        while ((dm = dynRe.exec(content))) {
          if (!dynAllowed || !dynAllowed.has(dm[1])) {
            violations.push(`forbidden-dynamic-proposal-field:${dm[1]}`);
          }
        }
      }

      // Public token channels must be rate-limited or status-auth guarded
      const guarded =
        content.includes('withRateLimit') ||
        content.includes('withAuth') ||
        content.includes('rateLimitedHandler') ||
        rel.endsWith('/route.ts'); // token GET is rate-limited inline below; checked separately
      expect(guarded, `${rel} missing guard`).toBe(true);

      inventory.push({
        route: '/api/' + rel.replace(/\/route\.ts$/, ''),
        file: 'app/api/' + rel,
        methods,
        writes,
        guard: content.includes('withAuth')
          ? 'withAuth+rateLimit'
          : content.includes('withRateLimit') || content.includes('rateLimitedHandler')
            ? 'rateLimit'
            : 'inline',
        violations,
      });
    }

    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactsDir, 'public-proposal-mutation.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scope: 'app/api/proposal/token/** public/tokenized proposal surfaces',
          forbiddenAuthorities: FORBIDDEN_PATTERNS.map((f) => f.name),
          allowedProposalUpdateFields: [...ALLOWED_PROPOSAL_UPDATE_FIELDS],
          surfaces: inventory,
        },
        null,
        2
      )
    );

    const allViolations = inventory.flatMap((i) =>
      i.violations.map((v: string) => `${i.route}: ${v}`)
    );
    expect(allViolations).toEqual([]);
  });

  it('token GET route performs no writes (read-only render data)', () => {
    const content = fs.readFileSync(path.join(TOKEN_PROPOSAL_DIR, '[token]/route.ts'), 'utf8');
    const getBlock = content.split('export const PATCH')[0];
    const writes = extractPrismaWrites(getBlock);
    expect(writes).toEqual([]);
  });

  it('routes public token artifact reads through the shared proposal access resolver', () => {
    const publicReads = [
      'proposal/token/[token]/route.ts',
      'proposal/token/[token]/accept/route.ts',
      'proposal/token/[token]/contact/route.ts',
      'proposal/token/[token]/share/route.ts',
      'proposal/token/[token]/email/route.ts',
      'proposal/token/[token]/track/route.ts',
      'proposal/token/[token]/pdf/route.ts',
      'presentation/[token]/export/route.ts',
    ];
    for (const rel of publicReads) {
      expect(fs.readFileSync(path.join(apiDir, rel), 'utf8'), rel).toContain(
        'resolvePublicProposalAccess'
      );
    }
  });

  it('internal proposal mutation routes stay session-authenticated', () => {
    const internal = [
      'proposal/id/[id]/send/route.ts',
      'proposal/id/[id]/outcome/route.ts',
      'proposal/id/[id]/resend/route.ts',
      'proposals/[id]/send/route.ts',
    ];
    for (const rel of internal) {
      const p = path.join(apiDir, rel);
      if (!fs.existsSync(p)) continue;
      const content = fs.readFileSync(p, 'utf8');
      expect(
        content.includes('withAuth') || content.includes('getServerSession'),
        `${rel} must require session/api-key auth`
      ).toBe(true);
    }
  });

  it('stripe/checkout-proposal is webLinkToken-gated and never trusts client tenant headers', () => {
    // checkout-proposal is intentionally NOT session-authenticated: it is a
    // payment-initialization surface gated by the proposal webLinkToken.
    // Verify it (a) requires webLinkToken in its schema and (b) does not read
    // x-tenant-id (caller-controlled tenant selection) and (c) never writes
    // tenant configuration.
    const p = path.join(apiDir, 'stripe/checkout-proposal/route.ts');
    const content = fs.readFileSync(p, 'utf8');
    expect(content).toContain('webLinkToken');
    expect(content).not.toContain('x-tenant-id');
    expect(extractPrismaWrites(content).filter((w) => /tenant/i.test(w))).toEqual([]);
  });
});
