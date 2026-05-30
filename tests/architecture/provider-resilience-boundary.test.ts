import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Helper to recursively list files
function getFiles(dir: string): string[] {
  const subdirs = fs.readdirSync(dir);
  const files = subdirs.map((subdir) => {
    const res = path.resolve(dir, subdir);
    return fs.statSync(res).isDirectory() ? getFiles(res) : [res];
  });
  return files.reduce((a, f) => a.concat(f), []);
}

describe('Provider Resilience Architectural Boundary', () => {
  it('enforces that all external provider integrations use withProviderResilience wrapper', () => {
    const targetDirs = [
      path.resolve(__dirname, '../../lib/modules'),
      path.resolve(__dirname, '../../lib/stripe'),
      path.resolve(__dirname, '../../lib/email'),
      path.resolve(__dirname, '../../lib/outreach'),
    ];

    const violations: string[] = [];

    for (const dir of targetDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = getFiles(dir).filter((file) => {
        // Skip test files, types, and the main initialization/config files
        const basename = path.basename(file);
        return (
          /\.(ts|js|tsx|jsx)$/.test(file) &&
          !file.includes('/__tests__/') &&
          !file.includes('.test.') &&
          !file.includes('.spec.') &&
          basename !== 'types.ts' &&
          basename !== 'stripe.ts' // Initialization of stripe instance
        );
      });

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');

        // Check if there is an outgoing network or provider call
        const hasFetch = content.includes('fetch(');
        const hasStripeCall = /\bstripe\.[a-zA-Z0-9_\.]+\(/.test(content);
        const hasResendCall = /\bresend\.[a-zA-Z0-9_\.]+\(/.test(content);

        if (hasFetch || hasStripeCall || hasResendCall) {
          // If it does have an outgoing call, it must import or use withProviderResilience
          const hasResilienceWrapper = content.includes('withProviderResilience');
          // Allow explicit escape-hatch comment if absolutely needed for debugging or initialization
          const hasBypass = content.includes('// RESILIENCE_BYPASS');

          if (!hasResilienceWrapper && !hasBypass) {
            const reasons: string[] = [];
            if (hasFetch) reasons.push('raw fetch() call');
            if (hasStripeCall) reasons.push('raw stripe client call');
            if (hasResendCall) reasons.push('raw resend client call');

            const relativePath = path.relative(path.resolve(__dirname, '../..'), file);
            violations.push(
              `${relativePath} makes ${reasons.join(', ')} but is not wrapped in withProviderResilience`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      const errorMsg = [
        'Architectural Boundary Violation: Raw provider calls found without the resiliency wrapper!',
        'Please wrap all raw outgoing third-party calls (fetch, stripe, resend) inside `withProviderResilience`.',
        '',
        ...violations.map((v) => ` - ${v}`),
      ].join('\n');

      throw new Error(errorMsg);
    }

    // Success
    expect(violations.length).toBe(0);
  });
});
