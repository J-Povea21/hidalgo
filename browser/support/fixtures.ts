import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, expect } from '@playwright/test';
import { TOKEN_HEADER } from '@shared/constants.ts';
import { ClaudeSession } from './claude/session.ts';
import { UserInPage } from './user/user.ts';

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

/**
 * The fixtures every browser test gets:
 *
 * - `claude`: a Claude session driving a real workbench server (claude/session.ts);
 * - `user`: the user in the page (user/user.ts);
 * - `anotherClaude()`: a second session on the same machine, for tests about two;
 * - `net`: which requests carried the run's token, to prove it never went somewhere.
 *
 * Every page is guarded: an uncaught error or a Content-Security-Policy violation fails
 * the test, whatever the test itself checks.
 */
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
    await page.addInitScript(recordCspViolations);
    await use(page);
    for (const openPage of page.context().pages()) {
      const violations = await openPage.evaluate(() => window.__csp ?? []).catch((): string[] => []);
      problems.push(...violations.map((violation) => `CSP violation: ${violation}`));
    }
    expect(problems, 'the page threw or broke its Content-Security-Policy').toEqual([]);
  },
});

export { expect };

/** Runs in the page before its own scripts. */
function recordCspViolations() {
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__csp ??= [];
    window.__csp.push(`${event.violatedDirective} ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}`);
  });
}
