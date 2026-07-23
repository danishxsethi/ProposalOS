import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                '.next/**',
                '*.config.*',
                '**/*.d.ts',
                'lib/prisma.ts'
            ]
        },
        alias: {
            '@': '/Users/danishsethi/ProposalOS'
        }
    },
    resolve: {
        alias: {
            '@': '/Users/danishsethi/ProposalOS'
        }
    }
});
