/**
 * The browser suite's fixture: the real bundled server over stdio, played by
 * the test as Claude (MCP tool calls), while Playwright plays the user in the
 * real page. One server, one temporary data folder per test.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { test as base } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface Workbench {
  /** Calls a tool as Claude would; throws on a tool error, returns the parsed result. */
  call(name: string, args: Record<string, unknown>): Promise<any>;
  /** Starts a call without waiting for it (wait_for_events); resolves when it returns. */
  start(name: string, args: Record<string, unknown>): Promise<any>;
  /** The page addresses the server asked to open, in order. */
  pages: string[];
  /** Resolves with the next page address the server asks to open. */
  nextPage(): Promise<string>;
  data: string;
}

async function boot(data: string): Promise<{ wb: Workbench; stop: () => Promise<void> }> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'dist', 'server.mjs')],
    env: { ...(process.env as Record<string, string>), CLAUDE_PLUGIN_DATA: data, WORKBENCH_OPEN: '0' },
    stderr: 'pipe',
  });
  const pages: string[] = [];
  const waiters: ((url: string) => void)[] = [];
  transport.stderr?.on('data', (chunk: Buffer) => {
    for (const m of String(chunk).matchAll(/workbench page: (\S+)/g)) {
      pages.push(m[1]!);
      waiters.shift()?.(m[1]!);
    }
  });
  const client = new Client({ name: 'browser-suite', version: '1' });
  await client.connect(transport);

  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 })) as { content: { text: string }[]; isError?: boolean };
    const body = JSON.parse(r.content[0]!.text);
    if (r.isError) throw new Error(`${name}: ${body.message ?? JSON.stringify(body)}`);
    return body;
  };
  const wb: Workbench = {
    call,
    start: (name, args) => call(name, args),
    pages,
    nextPage: () => new Promise((r) => waiters.push(r)),
    data,
  };
  return { wb, stop: () => client.close() };
}

export const test = base.extend<{ wb: Workbench }>({
  wb: async ({}, use) => {
    const data = mkdtempSync(join(tmpdir(), 'wb-browser-'));
    const { wb, stop } = await boot(data);
    await use(wb);
    await stop();
    rmSync(data, { recursive: true, force: true });
  },
});

export { expect } from '@playwright/test';

/** A valid card, overridable per test. */
export const card = (title = 'Formulación - OfficesExist validator returns 500 on a non-array') => ({
  title,
  tags: ['backend', 'bug'],
  proposal: { priority: 'high', shape: 'one card, one PR', status: 'ready for work', related: 'none' },
  body: { what: '`officeIds` sent as anything other than an array returns a 500.', where: ['`src/offices-exist.decorator.ts:12`'] },
  criteria: [{ mode: 'code', text: 'The validator guards its own input' }],
  manualQa: ['Submitting the activity form with valid offices still saves'],
  assuming: [],
  provenance: 'browser suite',
});

export const question = {
  text: 'Fix the other validators here or separately?',
  evidence: [{ kind: 'verified', text: '4 matches' }],
  options: [{ label: 'Separately', detail: 'One file.' }, { label: 'Here', detail: 'All at once.' }],
  recommended: 0,
};
