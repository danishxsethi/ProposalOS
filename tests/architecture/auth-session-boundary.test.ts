import fs from 'fs';
import path from 'path';
import { describe, it } from 'vitest';

describe('Auth & Session Architecture Boundary Tests', () => {
  // ─── Rule 1: runWithAuthAdapterContext bypass restrictions ───────────────────
  it('restricts runWithAuthAdapterContext imports to approved identity and adapter files only', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const allowedFiles = [
      path.resolve(rootDir, 'lib/auth.ts'),
      path.resolve(rootDir, 'lib/auth/adapterContext.ts'),
      path.resolve(rootDir, 'lib/auth/wrappedPrismaAdapter.ts'),
      // RAOS adapter-filter coverage scanner: references the symbol name in
      // JSDoc documentation only (not an import or call). Approved exception
      // — the scanner describes the bypass mechanism for documentation purposes.
      // Fix for register #3 (arch-boundary false positive). [#3]
      path.resolve(rootDir, 'lib/raos/tenantIsolation/adapterFilterCoverage.ts'),
      // RAOS adapter-filter inventory: references the symbol in a comment and
      // a string description field (not an import or call). Approved exception
      // for the same reason as adapterFilterCoverage.ts above. [#3]
      path.resolve(rootDir, 'lib/raos/tenantIsolation/adapterFilterInventory.ts'),
    ];

    const scanDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip node_modules, .next, .git, and tests directory
        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '.git' ||
          entry.name === 'tests' ||
          entry.name === 'docs'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          // If the file is not explicitly allowed, ensure it does not import/use runWithAuthAdapterContext
          if (!allowedFiles.includes(path.resolve(fullPath))) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('runWithAuthAdapterContext')) {
              throw new Error(
                `Architectural Violation: runWithAuthAdapterContext is imported or referenced in a non-identity file: ${path.relative(rootDir, fullPath)}`
              );
            }
          }
        }
      }
    };

    scanDirectory(path.join(rootDir, 'app'));
    scanDirectory(path.join(rootDir, 'lib'));
  });

  // ─── Rule 2: Secret redaction in logger and console statements ───────────────
  it('ensures no route or lib file prints raw secrets or tokens to logs', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const logLeakRegex =
      /(logger|console)\..*(cookie|authorization|sessionToken|refreshToken|webLinkToken|magicToken)/i;

    const scanDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === '.git' ||
          entry.name === 'tests'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (logLeakRegex.test(content)) {
            // Find the specific line that matched for better error reporting
            const lines = content.split('\n');
            lines.forEach((line, idx) => {
              if (logLeakRegex.test(line)) {
                throw new Error(
                  `Security Violation: Potential secret logging leak detected at ${path.relative(rootDir, fullPath)}:L${idx + 1}\nMatch: "${line.trim()}"`
                );
              }
            });
          }
        }
      }
    };

    scanDirectory(path.join(rootDir, 'app'));
    scanDirectory(path.join(rootDir, 'lib'));
  });

  // ─── Rule 3: Protected API routes use approved auth helpers ──────────────────
  it('enforces that all protected API routes utilize approved auth or session validation helpers', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const apiDir = path.join(rootDir, 'app/api');

    const exemptPrefixes = [
      'auth/',
      'public/',
      'widget/',
      'outreach/track/',
      'proposal/token/',
      'team/invite/',
      'client/',
      'cron/',
      'worker/',
      'admin/',
      'billing/',
      'cache/',
      'prompt/',
      'chat/',
      'email/',
      'stripe/',
      'onboarding/',
    ];

    const exemptExact = [
      'checkout/route.ts',
      'health/route.ts',
      'openapi/route.ts',
      'metrics/route.ts',
      'predictions/route.ts',
      'proposal-status/status/route.ts',
      'pipeline/chat/route.ts',
      'pipeline/engagement/route.ts',
      'csrf/route.ts',
    ];

    const exemptSubstring = ['[token]', 'proposal/[id]/chat'];

    const isPublicOrExemptRoute = (filePath: string) => {
      const relative = path.relative(apiDir, filePath);

      const hasPrefix = exemptPrefixes.some((pref) => relative.startsWith(pref));
      if (hasPrefix) return true;

      const hasExact = exemptExact.includes(relative);
      if (hasExact) return true;

      const hasSub = exemptSubstring.some((sub) => relative.includes(sub));
      if (hasSub) return true;

      return false;
    };

    const scanDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.isFile() && (entry.name === 'route.ts' || entry.name === 'route.tsx')) {
          if (!isPublicOrExemptRoute(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const hasAuthHelper =
              content.includes('withAuth') ||
              content.includes('getServerSession') ||
              content.includes('verifyCronAuth') ||
              content.includes('verifyWorkerAuth') ||
              content.includes('validateApiKey') ||
              content.includes('getTenantId') ||
              content.includes('auth(');

            if (!hasAuthHelper) {
              throw new Error(
                `Architectural Violation: Protected API route is missing approved authentication or session helpers (withAuth, getServerSession): ${path.relative(rootDir, fullPath)}`
              );
            }
          }
        }
      }
    };

    if (fs.existsSync(apiDir)) {
      scanDirectory(apiDir);
    }
  });
});
