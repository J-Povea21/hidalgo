/**
 * The fixtures every browser test gets:
 *
 * - `claude`: a Claude session driving a real workbench server (support/claude.ts);
 * - `user`: the user in the page (support/user.ts);
 * - `anotherClaude()`: a second session on the same machine, for tests about two;
 * - `net`: which requests carried the run's token, to prove it never went somewhere.
 *
 * Every page is guarded: an uncaught error or a Content-Security-Policy violation
 * fails the test, whatever the test itself checks.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { ClaudeSession } from './claude.ts';
import { UserInPage } from './user.ts';

const TOKEN_HEADER = 'x-workbench-token';

export interface Net {
  /** URLs of every request that carried the run's token. */
  tokenRequests: string[];
}

interface Fixtures {
  dataFolder: string;
  claude: ClaudeSession;
  anotherClaude: () => Promise<ClaudeSession>;
  user: UserInPage;
  net: Net;
}

export const test = base.extend<Fixtures>({
  dataFolder: async ({}, use) => {
    const folder = mkdtempSync(join(tmpdir(), 'wb-browser-'));
    await use(folder);
    rmSync(folder, { recursive: true, force: true });
  },
  claude: async ({ dataFolder }, use) => {
    const claude = await new ClaudeSession(dataFolder).start();
    await use(claude);
    await claude.ends();
  },
  anotherClaude: async ({ dataFolder }, use) => {
    const started: ClaudeSession[] = [];
    await use(async () => {
      const session = await new ClaudeSession(dataFolder, true).start();
      started.push(session);
      return session;
    });
    for (const session of started) {
      await session.ends();
    }
  },
  user: async ({ page }, use) => {
    await use(new UserInPage(page));
  },
  net: async ({ page }, use) => {
    const net: Net = { tokenRequests: [] };
    page.on('request', (request) => {
      if (request.headers()[TOKEN_HEADER]) {
        net.tokenRequests.push(request.url());
      }
    });
    await use(net);
  },
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        const seen = ((window as unknown as { __csp: string[] }).__csp ??= []);
        seen.push(`${event.violatedDirective} ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
      });
    });
    await use(page);
    for (const openPage of page.context().pages()) {
      const violations = await openPage
        .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
        .catch(() => [] as string[]);
      problems.push(...violations.map((violation) => `CSP violation: ${violation}`));
    }
    expect(problems, 'the page threw or broke its Content-Security-Policy').toEqual([]);
  },
});

export { expect };
