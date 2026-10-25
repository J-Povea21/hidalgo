import { defineConfig, devices } from '@playwright/test';

// Browser suite: `pnpm run test:browser`, run before pushing (not part of `pnpm run check`).
export default defineConfig({
  testDir: 'browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], headless: true, trace: 'retain-on-failure' },
});
