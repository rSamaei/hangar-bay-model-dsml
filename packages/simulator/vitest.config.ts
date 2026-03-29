import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            // Pure interface/type-only files compile to empty JavaScript — v8 cannot
            // execute any statements in them, so they must be excluded from coverage.
            exclude: [
                'src/types/conflict.ts',
                'src/types/dimensions.ts',
                'src/types/export.ts',
                'src/types/model.ts',
                'src/types/simulation.ts',
                // Pure barrel/shim files — compile to nearly empty JS, no executable statements
                'src/engine.ts',
                'src/index.ts',
            ]
        }
    }
});
