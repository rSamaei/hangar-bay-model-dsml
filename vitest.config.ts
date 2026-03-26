import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: [
                'packages/language/src/**/*.ts',
                'packages/cli/src/**/*.ts',
                'packages/simulator/src/**/*.ts',
                'packages/web/backend/**/*.ts',
            ],
            exclude: [
                'packages/language/src/generated/**',
                'packages/web/backend/db/**',
            ],
        },
    },
});
