import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/deep-localization-cross-tenant-intelligence/**/*.test.ts', 'lib/deep-localization-cross-tenant-intelligence/**/*.property.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/deep-localization-cross-tenant-intelligence/**/*.ts'],
      exclude: [
        'lib/deep-localization-cross-tenant-intelligence/**/*.test.ts',
        'lib/deep-localization-cross-tenant-intelligence/**/*.property.test.ts',
        'lib/deep-localization-cross-tenant-intelligence/db/**',
        'lib/deep-localization-cross-tenant-intelligence/__tests__/**',
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 30000,
  },
});
