import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readToolResult } from '@test/tool-result.ts';
import { TOOL_TIMEOUT_MS } from '../constants.ts';
import { card } from '../data.ts';
import type { ItemOnPage, RunOptions } from '../types.ts';
import { OpenRun } from './run.ts';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SERVER = join(packageRoot, 'dist', 'server.mjs');
const LAUNCH_APART = join(packageRoot, 'browser', 'support', 'launch-apart.mjs');
/** With HIDALGO_OPEN=0 the server prints the page it would open instead of opening it. */
const OPENED_PAGE = /hidalgo page: (\S+)/g;

/**
 * Claude's side of a browser test: the real bundled Hidalgo server over stdio, driven
 * with the same MCP tool calls Claude makes. The session starts, ends, crashes and restarts
 * the server; what Claude does with a run is on the run (run.ts).
 */
export class ClaudeSession {
  private client!: Client;
  private transport!: StdioClientTransport;
  /** Every page address the server asked to open, in order. */
  readonly openedPages: string[] = [];
  private pageWaiters: ((url: string) => void)[] = [];

  /**
   * `apart`: the server runs under its own launcher, as another Claude Code would. Servers in
   * one test worker otherwise share a parent, and a second one would take the first one's runs.
   */
  constructor(
    readonly dataFolder: string,
    private readonly apart = false,
  ) {}

  async start(): Promise<this> {
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: this.apart ? [LAUNCH_APART, SERVER] : [SERVER],
      env: { ...definedEnvironment(), CLAUDE_PLUGIN_DATA: this.dataFolder, HIDALGO_OPEN: '0' },
      stderr: 'pipe',
    });
    this.transport.stderr?.on('data', (chunk: Buffer) => {
      for (const match of String(chunk).matchAll(OPENED_PAGE)) {
        this.openedPages.push(match[1]!);
        this.pageWaiters.shift()?.(match[1]!);
      }
    });
    this.client = new Client({ name: 'browser-suite', version: '1' });
    await this.client.connect(this.transport);
    return this;
  }

  /** Opens a run and puts the given cards on its page. */
  async opensRun(options: RunOptions = {}): Promise<OpenRun> {
    const { runId, threadId } = await this.call('open_session', {
      skill: 'card',
      project: options.project ?? 'Storefront',
      subject: options.subject ?? 's',
    });
    const cards = options.cards ?? [{}];
    let items: ItemOnPage[] = [];
    if (cards.length > 0) {
      const toAdd = cards.map((spec, position) => ({
        kind: 'card',
        fields: card(spec.title ?? `Card ${position + 1}`),
        ...(spec.questions ? { questions: spec.questions } : {}),
      }));
      ({ added: items } = await this.call('add_items', { runId, items: toAdd }));
    }
    return new OpenRun(this, { runId, threadId, items, url: this.pageOf(runId) });
  }

  /** Calls a tool; throws on a tool error, returns its parsed answer. */
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const result = await this.client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS });
    const { body, isError } = readToolResult(result);
    const answer = JSON.parse(body);
    if (isError) {
      throw new Error(`${name}: ${answer.message ?? body}`);
    }
    return answer;
  }

  /** Resolves with the next page address the server asks to open. */
  nextOpenedPage(): Promise<string> {
    return new Promise((resolveNext) => this.pageWaiters.push(resolveNext));
  }

  /**
   * The run's page address, from the live index the server writes before open_session
   * returns (its stderr line and the tool result travel on two pipes with no order).
   */
  pageOf(runId: string): string {
    const entry: { url: string } = JSON.parse(
      readFileSync(join(this.dataFolder, 'hidalgo', 'live', `${runId}.json`), 'utf8'),
    );
    return entry.url;
  }

  /** The session ends the normal way: stdin closes, the server says goodbye to its pages. */
  async ends(): Promise<void> {
    await this.client.close().catch(() => undefined);
  }

  /** The server dies without a goodbye, as in a crash. */
  async crashes(): Promise<void> {
    const pid = this.transport.pid;
    if (pid) {
      process.kill(pid, 'SIGKILL');
    }
    await this.client.close().catch(() => undefined);
  }

  /** A new server for the same session (same data, same owner), as after a /mcp reconnect. */
  async restarts(): Promise<void> {
    await this.start();
  }
}

/** The test's environment, without the unset variables a child process can't take. */
function definedEnvironment(): Record<string, string> {
  const defined: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      defined[name] = value;
    }
  }
  return defined;
}
