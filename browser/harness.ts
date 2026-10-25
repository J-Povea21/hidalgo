/**
 * The browser suite's fixtures: the real bundled server over stdio, played by
 * the test as Claude (MCP tool calls), while Playwright plays the user in the
 * real page. One temporary data folder per test.
 *
 * Every page is guarded: an uncaught error or a Content-Security-Policy
 * violation fails the test, and each request that carried the token is
 * recorded so a test can prove the token never went somewhere.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { test as base, expect, type Page } from '@playwright/test';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_HEADER = 'x-workbench-token';

/** One Claude session: a workbench server and the MCP client that drives it. */
export class Session {
  private client!: Client;
  private transport!: StdioClientTransport;
  /** The page addresses the server asked to open, in order. */
  readonly pages: string[] = [];
  private waiters: ((url: string) => void)[] = [];

  /**
   * `separate`: run the server under its own `sh`, so its parent process (the "Claude Code"
   * that owns its runs) differs from the default session's. Without it, every server in a
   * worker shares a parent and a second one would take over the first one's runs.
   */
  constructor(
    readonly data: string,
    private readonly separate = false,
  ) {}

  async boot(): Promise<this> {
    const server = join(root, 'dist', 'server.mjs');
    this.transport = new StdioClientTransport({
      command: this.separate ? '/bin/sh' : process.execPath,
      // `; :` keeps sh from exec-ing node, so node's parent really is the sh.
      args: this.separate ? ['-c', `"${process.execPath}" "${server}"; :`] : [server],
      env: { ...(process.env as Record<string, string>), CLAUDE_PLUGIN_DATA: this.data, WORKBENCH_OPEN: '0' },
      stderr: 'pipe',
    });
    this.transport.stderr?.on('data', (chunk: Buffer) => {
      for (const match of String(chunk).matchAll(/workbench page: (\S+)/g)) {
        this.pages.push(match[1]!);
        this.waiters.shift()?.(match[1]!);
      }
    });
    this.client = new Client({ name: 'browser-suite', version: '1' });
    await this.client.connect(this.transport);
    return this;
  }

  /** Calls a tool as Claude would; throws on a tool error, returns the parsed result. */
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const result = (await this.client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const body = JSON.parse(result.content[0]!.text);
    if (result.isError) throw new Error(`${name}: ${body.message ?? JSON.stringify(body)}`);
    return body;
  }

  /**
   * Starts a call without waiting for it (wait_for_events). A call still pending when the
   * session stops rejects; that is expected and swallowed, the test awaits what it needs.
   */
  start(name: string, args: Record<string, unknown>): Promise<any> {
    const pending = this.call(name, args);
    pending.catch(() => undefined);
    return pending;
  }

  /** Resolves with the next page address the server asks to open. */
  nextPage(): Promise<string> {
    return new Promise((resolveNext) => this.waiters.push(resolveNext));
  }

  /**
   * The run's page address, from the live index the server writes before open_session
   * returns. (Its stderr line and the tool result travel on two pipes with no order.)
   */
  url(runId: string): string {
    return (JSON.parse(readFileSync(join(this.data, 'workbench', 'live', `${runId}.json`), 'utf8')) as { url: string })
      .url;
  }

  /** Ends the session the normal way: stdin closes, the server says goodbye to its pages. */
  async stop(): Promise<void> {
    await this.client.close().catch(() => undefined);
  }

  /** Kills the server without a goodbye, as a crash would. */
  async crash(): Promise<void> {
    const pid = this.transport.pid;
    if (pid) process.kill(pid, 'SIGKILL');
    await this.client.close().catch(() => undefined);
  }

  /** A new server for the same session (same data, same owner), as after a /mcp reconnect. */
  async restart(): Promise<void> {
    await this.boot();
  }
}

export interface Net {
  /** URLs of every request that carried the run's token. */
  tokenRequests: string[];
}

export const test = base.extend<{ wb: Session; net: Net; data: string; newSession: () => Promise<Session> }>({
  data: async ({}, use) => {
    const data = mkdtempSync(join(tmpdir(), 'wb-browser-'));
    await use(data);
    rmSync(data, { recursive: true, force: true });
  },
  wb: async ({ data }, use) => {
    const wb = await new Session(data).boot();
    await use(wb);
    await wb.stop();
  },
  /** Another Claude session on the same machine (same data folder). */
  newSession: async ({ data }, use) => {
    const made: Session[] = [];
    await use(async () => {
      const session = await new Session(data, true).boot();
      made.push(session);
      return session;
    });
    for (const session of made) await session.stop();
  },
  net: async ({ page }, use) => {
    const net: Net = { tokenRequests: [] };
    page.on('request', (request) => {
      if (request.headers()[TOKEN_HEADER]) net.tokenRequests.push(request.url());
    });
    await use(net);
  },
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        ((window as unknown as { __csp: string[] }).__csp ??= []).push(
          `${event.violatedDirective} ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber} sample=${event.sample}`,
        );
      });
    });
    await use(page);
    for (const openPage of page.context().pages()) {
      const csp = await openPage
        .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
        .catch(() => [] as string[]);
      errors.push(...csp.map((violation) => `CSP violation: ${violation}`));
    }
    expect(errors, 'the page threw or broke its Content-Security-Policy').toEqual([]);
  },
});

export { expect };

/** The colour of the tab's favicon dot, read from its centre pixel. */
export async function faviconColor(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel=icon]')?.href;
    if (!href) return 'none';
    const img = new Image();
    img.src = href;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const drawing = canvas.getContext('2d')!;
    drawing.drawImage(img, 0, 0);
    const [red, gr, blue] = drawing.getImageData(16, 16, 1, 1).data;
    return `#${[red, gr, blue].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`;
  });
}

export const FAVICON = { yours: '#c27c0e', working: '#2f5bd3', idle: '#9b9a94', done: '#1f7a4d', offline: '#9b9a94' };

/** The turn line's state (`data-turn`), apart from its wording. */
export const turnOf = (page: Page) => page.locator('[data-turn]').getAttribute('data-turn');
/** The connection state the page shows (`data-connection` on <html>). */
export const connectionOf = (page: Page) => page.locator('html').getAttribute('data-connection');

/** A valid card, overridable per test. */
export const card = (title = 'Formulación - OfficesExist validator returns 500 on a non-array') => ({
  title,
  tags: ['backend', 'bug'],
  proposal: { priority: 'high', shape: 'one card, one PR', status: 'ready for work', related: 'none' },
  body: {
    what: '`officeIds` sent as anything other than an array returns a 500.',
    where: ['`src/offices-exist.decorator.ts:12`'],
  },
  criteria: [
    { mode: 'code', text: 'The validator guards its own input' },
    { mode: 'test', text: 'A unit test covers each non-array input' },
  ],
  manualQa: ['Submitting the activity form with valid offices still saves'],
  assuming: [],
  provenance: 'browser suite',
});

export const question = {
  text: 'Fix the other validators here or separately?',
  evidence: [{ kind: 'verified', text: '4 matches' }],
  options: [
    { label: 'Separately', detail: 'One file.' },
    { label: 'Here', detail: 'All at once.' },
    { label: 'Neither', detail: 'Leave them.' },
  ],
  recommended: 0,
};

/** Opens a run with the given items and returns its ids and page address. */
export async function openRun(wb: Session, items: { fields?: unknown; questions?: unknown[] }[] = [{}], subject = 's') {
  const { runId, threadId } = await wb.call('open_session', { skill: 'card', project: 'MiPlan', subject });
  const { added } = items.length
    ? await wb.call('add_items', {
        runId,
        items: items.map((item, index) => ({
          kind: 'card',
          fields: item.fields ?? card(`Card ${index + 1}`),
          ...(item.questions ? { questions: item.questions } : {}),
        })),
      })
    : { added: [] };
  return { runId, threadId, added: added as { id: string; rev: number; threadId: string }[], url: wb.url(runId) };
}
