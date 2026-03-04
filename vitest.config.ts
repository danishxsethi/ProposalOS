import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

import url from 'url';
import path from 'path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        fileParallelism: false,
        setupFiles: ['./vitest.setup.ts'],
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            thresholds: {
                lines: 50,
                functions: 50,
                branches: 40,
                statements: 50,
            },
            include: ['lib/**/*.ts'],
            exclude: [
                'node_modules/**',
                '.next/**',
                '*.config.*',
                '**/*.d.ts',
                'lib/prisma.ts',
                'lib/**/__tests__/**',
                'lib/**/*.test.ts'
            ]
        },
        alias: {
            '@': path.resolve(__dirname, './')
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './')
        }
    }
});
