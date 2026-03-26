import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
    'packages/language/vitest.config.ts',
    'packages/cli/vitest.config.ts',
    'packages/simulator/vitest.config.ts',
    'packages/web/vitest.config.ts',
]);
