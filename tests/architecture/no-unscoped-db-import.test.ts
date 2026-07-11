/**
 * Architecture test (P1-05): prevents new production code from importing the unscoped
 * `prisma` client. `lib/db.ts` now exports only `withSystemDbBypass` — a Prisma client
 * export from that module would mean a second, differently-scoped client exists again.
 */
import { execSync } from 'child_process';

import { describe, expect, it } from 'vitest';

const PROD_DIRS = ['app', 'lib'];

function grepImportsOfLibDb(): string[] {
  try {
    const out = execSync(`grep -rln "from '@/lib/db'" ${PROD_DIRS.join(' ')} 2>/dev/null || true`, {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes('.test.') && !f.endsWith('lib/db.ts'));
  } catch {
    return [];
  }
}

function grepUnscopedPrismaImport(): string[] {
  try {
    const out = execSync(
      `grep -rln "import { prisma } from '@/lib/db'" ${PROD_DIRS.join(' ')} 2>/dev/null || true`,
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

describe('P1-05: no unscoped root Prisma client import', () => {
  it('no production file imports { prisma } from @/lib/db', () => {
    const offenders = grepUnscopedPrismaImport();
    expect(offenders).toEqual([]);
  });

  it('lib/db.ts no longer exports a bare prisma client', () => {
    const src = execSync('cat lib/db.ts', { encoding: 'utf8' });
    expect(src).not.toMatch(/export const prisma\b/);
    expect(src).toMatch(/export async function withSystemDbBypass/);
  });

  it('every remaining @/lib/db importer uses withSystemDbBypass, not a raw client', () => {
    const importers = grepImportsOfLibDb();
    for (const file of importers) {
      const src = execSync(`cat "${file}"`, { encoding: 'utf8' });
      expect(src).toMatch(/withSystemDbBypass/);
    }
  });
});
