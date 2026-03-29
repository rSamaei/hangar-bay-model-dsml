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
                // Pure interface/type-only files — compile to empty JS, nothing for v8 to execute.
                'packages/simulator/src/types/conflict.ts',
                'packages/simulator/src/types/dimensions.ts',
                'packages/simulator/src/types/export.ts',
                'packages/simulator/src/types/model.ts',
                'packages/simulator/src/types/simulation.ts',
            ],
            thresholds: {
                statements: 85,
                branches: 75,
                functions: 85,
                lines: 85,
            },
        },
    },
});
