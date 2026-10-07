/**
 * Architecture test (Wave 3, Step 6/10 — P1-09/P2-13/P2-36): prevents new production
 * code from writing to the `Finding` table outside the one validated persistence
 * boundary, `lib/audit/findingPersistence.ts`. Every mutating `prisma.finding.*` call
 * in production code (`app/`, `lib/`) must live in that one file — a direct write
 * anywhere else can silently bypass the runtime Finding/Evidence contract
 * (lib/audit/findingContract.ts), which the Prisma schema itself cannot enforce
 * (`evidence`/`metrics`/`recommendedFix` are untyped `Json` columns).
 *
 * `prisma/seed.ts` (dev-only local seed tooling, never request-serving) and `*.test.ts`
 * files (which legitimately construct fixture rows directly) are the only allowlisted
 * exceptions.
 */
import { execSync } from 'child_process';

import { describe, expect, it } from 'vitest';

const PROD_DIRS = ['app', 'lib'];
const APPROVED_BOUNDARY_FILE = 'lib/audit/findingPersistence.ts';
const ALLOWLISTED_FILES = new Set<string>(['prisma/seed.ts']);

const MUTATING_FINDING_CALL = /prisma\.finding\.(create|createMany|update|updateMany|upsert)\(/;

function grepMutatingFindingWrites(): string[] {
  try {
    const out = execSync(
      `grep -rlE "prisma\\.finding\\.(create|createMany|update|updateMany|upsert)\\(" ${PROD_DIRS.join(' ')} 2>/dev/null || true`,
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

describe('Wave 3: no unauthorized direct Finding writes', () => {
  it('every mutating prisma.finding.* call outside the approved boundary is a test or allowlisted file', () => {
    const offenders = grepMutatingFindingWrites().filter(
      (f) => f !== APPROVED_BOUNDARY_FILE && !f.includes('.test.') && !ALLOWLISTED_FILES.has(f)
    );
    expect(offenders).toEqual([]);
  });

  it('the approved boundary file actually contains the mutating calls (sanity check the regex/grep)', () => {
    const src = execSync(`cat "${APPROVED_BOUNDARY_FILE}"`, { encoding: 'utf8' });
    expect(MUTATING_FINDING_CALL.test(src)).toBe(true);
  });

  it('lib/audit/runner.ts no longer calls prisma.finding.createMany directly', () => {
    const src = execSync('cat lib/audit/runner.ts', { encoding: 'utf8' });
    expect(MUTATING_FINDING_CALL.test(src)).toBe(false);
  });

  it('app/api/finding/[id]/route.ts no longer calls prisma.finding.update directly', () => {
    const src = execSync('cat "app/api/finding/[id]/route.ts"', { encoding: 'utf8' });
    expect(MUTATING_FINDING_CALL.test(src)).toBe(false);
  });
});
