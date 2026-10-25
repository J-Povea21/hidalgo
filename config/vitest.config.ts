import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Client tests that need a DOM declare it per file: `// @vitest-environment happy-dom`.
export default defineConfig({
  // Paths below are relative to the package, not to this folder.
  root: fileURLToPath(new URL('..', import.meta.url)),
  // The @shared, @server, @client and @test aliases come from tsconfig.json, defined once there.
  resolve: { tsconfigPaths: true },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
