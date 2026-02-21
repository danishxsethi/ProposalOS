module.exports = {
  displayName: 'deep-localization-cross-tenant-intelligence',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/lib/deep-localization-cross-tenant-intelligence'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.property.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'lib/deep-localization-cross-tenant-intelligence/**/*.ts',
    '!lib/deep-localization-cross-tenant-intelligence/**/*.test.ts',
    '!lib/deep-localization-cross-tenant-intelligence/**/*.property.test.ts',
    '!lib/deep-localization-cross-tenant-intelligence/db/**',
    '!lib/deep-localization-cross-tenant-intelligence/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/lib/deep-localization-cross-tenant-intelligence/__tests__/setup.ts'],
  testTimeout: 30000,
};
