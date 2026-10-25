/**
 * Claude's side of a browser test: the real bundled workbench server over stdio,
 * driven with the same MCP tool calls Claude makes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { card, type CardSpec } from './data.ts';

export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SERVER = join(packageRoot, 'dist', 'server.mjs');
const LAUNCH_APART = join(packageRoot, 'browser', 'support', 'launch-apart.mjs');
const TOOL_TIMEOUT_MS = 60_000;

/** A run Claude opened: its ids and the address of its page. */
export interface Run {
  runId: string;
  /** The whole run's conversation. */
  threadId: string;
  items: { id: string; rev: number; threadId: string }[];
  url: string;
}

/** What the page sent, as Claude receives it from wait_for_events or a tool result. */
export type PageEvent = Record<string, any>;

export class ClaudeSession {
  private client!: Client;
  private transport!: StdioClientTransport;
  /** Every page address the server asked to open, in order. */
  readonly openedPages: string[] = [];
  private pageWaiters: ((url: string) => void)[] = [];

  /**
   * `apart`: the server runs under its own launcher, as another Claude Code would. Servers
   * in one test worker otherwise share a parent, and a second one would take the first
   * one's runs over.
   */
  constructor(
    readonly dataFolder: string,
    private readonly apart = false,
  ) {}

  async start(): Promise<this> {
    this.transport = new StdioClientTransport({
      command: process.execPath,
      args: this.apart ? [LAUNCH_APART, SERVER] : [SERVER],
      env: { ...(process.env as Record<string, string>), CLAUDE_PLUGIN_DATA: this.dataFolder, WORKBENCH_OPEN: '0' },
      stderr: 'pipe',
    });
    // With WORKBENCH_OPEN=0 the server prints the page it would open instead of opening it.
    this.transport.stderr?.on('data', (chunk: Buffer) => {
      for (const match of String(chunk).matchAll(/workbench page: (\S+)/g)) {
        this.openedPages.push(match[1]!);
        this.pageWaiters.shift()?.(match[1]!);
      }
    });
    this.client = new Client({ name: 'browser-suite', version: '1' });
    await this.client.connect(this.transport);
    return this;
  }

  /** Calls a tool; throws on a tool error, returns its parsed result. */
  async call(name: string, args: Record<string, unknown>): Promise<any> {
    const result = (await this.client.callTool({ name, arguments: args }, undefined, { timeout: TOOL_TIMEOUT_MS })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const body = JSON.parse(result.content[0]!.text);
    if (result.isError) throw new Error(`${name}: ${body.message ?? JSON.stringify(body)}`);
    return body;
  }

  // ---- what Claude does, in the words a test reads ----

  /** Opens a run and puts the given cards on its page. */
  async opensRun(options: { subject?: string; project?: string; cards?: CardSpec[] } = {}): Promise<Run> {
    const { runId, threadId } = await this.call('open_session', {
      skill: 'card',
      project: options.project ?? 'MiPlan',
      subject: options.subject ?? 's',
    });
    const cards = options.cards ?? [{}];
    const { added } = cards.length
      ? await this.call('add_items', {
          runId,
          items: cards.map((spec, position) => ({
            kind: 'card',
            fields: card(spec.title ?? `Card ${position + 1}`),
            ...(spec.questions ? { questions: spec.questions } : {}),
          })),
        })
      : { added: [] };
    return { runId, threadId, items: added, url: this.pageOf(runId) };
  }

  /**
   * Starts waiting for the user, as Claude does in the background, and resolves with what
   * the page sends. A wait still open when the test ends is dropped, not reported.
   */
  waitsForTheUser(run: Run): Promise<PageEvent[]> {
    const waiting = this.call('wait_for_events', { runId: run.runId }).then((result) => result.events as PageEvent[]);
    waiting.catch(() => undefined);
    return waiting;
  }

  says(run: Run, threadId: string, text: string) {
    return this.call('send_message', { runId: run.runId, threadId, text });
  }

  replies(run: Run, to: PageEvent, text: string) {
    return this.call('send_message', { runId: run.runId, replyTo: to['seq'], text });
  }

  revises(run: Run, itemId: string, patch: Record<string, unknown>) {
    return this.call('update_item', { runId: run.runId, itemId, patch });
  }

  async draws(run: Run, spec: unknown): Promise<string> {
    return (await this.call('create_diagram', { runId: run.runId, spec })).diagramId;
  }

  marksDone(run: Run, itemId: string, note = 'created 86e3') {
    return this.call('mark_done', { runId: run.runId, itemId, note });
  }

  setsStatus(run: Run, line: string) {
    return this.call('set_status', { runId: run.runId, line });
  }

  closes(run: Run, outcome = 'done') {
    return this.call('close_session', { runId: run.runId, status: 'closed', outcome });
  }

  pauses(run: Run, outcome = 'later') {
    return this.call('close_session', { runId: run.runId, status: 'paused', outcome });
  }

  resumes(run: Run) {
    return this.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's', resume: run.runId });
  }

  // ---- the session itself ----

  /** Resolves with the next page address the server asks to open. */
  nextOpenedPage(): Promise<string> {
    return new Promise((resolveNext) => this.pageWaiters.push(resolveNext));
  }

  /**
   * The run's page address, from the live index the server writes before open_session
   * returns (its stderr line and the tool result travel on two pipes with no order).
   */
  pageOf(runId: string): string {
    const entry = join(this.dataFolder, 'workbench', 'live', `${runId}.json`);
    return (JSON.parse(readFileSync(entry, 'utf8')) as { url: string }).url;
  }

  /** The session ends the normal way: stdin closes, the server says goodbye to its pages. */
  async ends(): Promise<void> {
    await this.client.close().catch(() => undefined);
  }

  /** The server dies without a goodbye, as in a crash. */
  async crashes(): Promise<void> {
    const pid = this.transport.pid;
    if (pid) process.kill(pid, 'SIGKILL');
    await this.client.close().catch(() => undefined);
  }

  /** A new server for the same session (same data, same owner), as after a /mcp reconnect. */
  async restarts(): Promise<void> {
    await this.start();
  }
}
