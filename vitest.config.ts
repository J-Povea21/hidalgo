import { defineConfig } from 'vitest/config';

// Client tests that need a DOM declare it per file: `// @vitest-environment happy-dom`.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
