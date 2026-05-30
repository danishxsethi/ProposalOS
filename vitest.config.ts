import path from 'path';
import url from 'url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: ['next-auth'],
      },
    },
    globals: true,
    testTimeout: 30000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest}.config.*',
      'tests/e2e/**',
      'tests/load/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      // Fail the build if coverage thresholds are not met
      include: ['lib/**/*.ts'],
      exclude: [
        'node_modules/**',
        '.next/**',
        '*.config.*',
        '**/*.d.ts',
        'lib/prisma.ts',
        'lib/**/__tests__/**',
        'lib/**/*.test.ts',
      ],
    },
    alias: {
      '@': path.resolve(__dirname, './'),
      '@shared': path.resolve(__dirname, './packages/shared/src'),
      'next/server': path.resolve(__dirname, './node_modules/next/server.js'),
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@shared': path.resolve(__dirname, './packages/shared/src'),
      'next/server': path.resolve(__dirname, './node_modules/next/server.js'),
    },
  },
});
