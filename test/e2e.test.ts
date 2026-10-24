/**
 * End to end, in-process: a real MCP client talks to the real tools, the page
 * is played by real HTTP requests, and everything lands on a real disk folder.
 */
import { createHmac } from 'node:crypto';
import { request } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { recordPageEvent } from '../server/features/record-page-event/record-page-event.ts';
import { registerTools } from '../server/infra/mcp/tools.ts';
import { Workbench } from '../server/infra/workbench.ts';
import { card, question } from './fixtures.ts';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

async function boot(dataRoot?: string) {
  const root = dataRoot ?? mkdtempSync(join(tmpdir(), 'wb-e2e-'));
  const clientDir = mkdtempSync(join(tmpdir(), 'wb-client-'));
  writeFileSync(join(clientDir, 'index.html'), '<!doctype html><title>t</title>');
  const opened: string[] = [];
  const wb = new Workbench({
    dataRoot: root, clientDir, retentionDays: 7, heartbeatMs: 60_000,
    limits: { imageBytesPerRun: 1_000_000, imageWarnBytes: 800_000, waitTimeoutMs: 3_000 },
    openBrowser: (u) => opened.push(u),
  });
  wb.recordEvent = (runId, body) => recordPageEvent(wb, runId, body);
  const server = new McpServer({ name: 'workbench', version: 'test' });
  registerTools(server, wb);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  cleanups.push(async () => { await client.close(); await wb.shutdown('test over'); }, () => rmSync(clientDir, { recursive: true, force: true }));
  if (!dataRoot) cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args }) as { content: { text: string }[]; isError?: boolean };
    const text = r.content[0]!.text;
    if (!text.startsWith('{')) throw new Error(`${name}: ${text}`);
    return { ...JSON.parse(text), isError: !!r.isError };
  };
  return { wb, call, opened, root };
}

/** The page's side of the wire, with every header under the test's control. */
function http(port: number, path: string, opts: { method?: string; body?: unknown; token?: string; origin?: string | null; host?: string } = {}) {
  return new Promise<{ status: number; json: any }>((resolve, reject) => {
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const headers: Record<string, string> = { host: opts.host ?? `127.0.0.1:${port}` };
    if (opts.token) headers['x-workbench-token'] = opts.token;
    if (opts.origin !== null) headers['origin'] = opts.origin ?? `http://127.0.0.1:${port}`;
    if (body) headers['content-type'] = 'application/json';
    const req = request({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode!, json: data.startsWith('{') ? JSON.parse(data) : data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const tokenOf = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get('t')!;
const portOf = (url: string) => Number(new URL(url).port);

describe('workbench end to end', () => {
  it('open a run, post a page event over HTTP, and wait_for_events returns it', async () => {
    const { call, opened } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 'validator' });
    expect(opened).toHaveLength(1);
    const url = opened[0]!;
    const [port, token] = [portOf(url), tokenOf(url)];

    const { added } = await call('add_items', { runId, items: [{ kind: 'card', fields: card() }] });
    const itemId = added[0].id;
    const asked = await call('ask', { runId, itemId, questions: [question()] });

    const waiting = call('wait_for_events', { runId });
    await new Promise((r) => setTimeout(r, 100));
    const state = await http(port, `/api/state?run=${runId}`, { token });
    expect(state.json.waiting).toBe(true);
    expect(state.json.state.turn).toBe('user');

    const posted = await http(port, `/api/event?run=${runId}`, {
      method: 'POST', token, body: { type: 'answers', itemId, answers: { [asked.questionIds[0]]: { choice: 1, note: 'here' } } },
    });
    expect(posted.status).toBe(200);

    const got = await waiting;
    expect(got.events).toHaveLength(1);
    expect(got.events[0]).toMatchObject({ type: 'answers', item: itemId, answers: [{ chose: 'Here', note: 'here' }] });
  });

  it("the live stream tells the page it's the user's turn as soon as a wait starts", async () => {
    const { call, opened } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const [port, token] = [portOf(opened[0]!), tokenOf(opened[0]!)];
    const pushed: { waiting: boolean }[] = [];
    const req = request({ host: '127.0.0.1', port, path: `/api/stream?run=${runId}`, headers: { host: `127.0.0.1:${port}`, 'x-workbench-token': token } }, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        for (const m of buf.matchAll(/event: state\ndata: (.*)\n/g)) pushed.push(JSON.parse(m[1]!));
        buf = buf.slice(buf.lastIndexOf('\n\n') + 2);
      });
    });
    req.end();
    cleanups.push(() => { req.destroy(); });
    await new Promise((r) => setTimeout(r, 100));
    // Left pending on purpose; cleanup closes the client, which rejects it.
    call('wait_for_events', { runId }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
    expect(pushed.at(-1)?.waiting).toBe(true);
  });

  it('events ride along on the next tool result, exactly once', async () => {
    const { call, opened } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const [port, token] = [portOf(opened[0]!), tokenOf(opened[0]!)];
    const { added } = await call('add_items', { runId, items: [{ kind: 'card', fields: card() }] });
    const state = (await http(port, `/api/state?run=${runId}`, { token })).json.state;
    const thread = state.items[0].threadId;

    await http(port, `/api/event?run=${runId}`, { method: 'POST', token, body: { type: 'message', threadId: thread, text: 'while you work' } });
    const next = await call('set_status', { runId, line: 'writing criteria' });
    expect(next.events.map((e: any) => e.text)).toEqual(['while you work']);
    const after = await call('set_status', { runId, line: 'still writing' });
    expect(after.events).toBeUndefined();

    const reply = await call('send_message', { runId, text: 'got it', replyTo: next.events[0].seq });
    expect(reply.threadId).toBe(thread);
    expect(added).toHaveLength(1);
  });

  it('the approval gate holds over HTTP: stale revisions and open questions are refused', async () => {
    const { call, opened } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const [port, token] = [portOf(opened[0]!), tokenOf(opened[0]!)];
    const { added } = await call('add_items', { runId, items: [{ kind: 'card', fields: card(), questions: [question()] }] });
    const itemId = added[0].id;
    const open = await http(port, `/api/event?run=${runId}`, { method: 'POST', token, body: { type: 'verdict', itemId, rev: 1, value: 'approved' } });
    expect(open.status).toBe(409);
    expect(open.json.code).toBe('open-questions');
    await call('update_item', { runId, itemId, patch: { tags: ['x'] } });
    const stale = await http(port, `/api/event?run=${runId}`, { method: 'POST', token, body: { type: 'verdict', itemId, rev: 1, value: 'rejected' } });
    expect(stale.json.code).toBe('stale-revision');
  });

  it('close_session refuses while an item has no outcome', async () => {
    const { call } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    await call('add_items', { runId, items: [{ kind: 'card', fields: card() }] });
    const r = await call('close_session', { runId, status: 'closed', outcome: 'done' });
    expect(r).toMatchObject({ isError: true, error: 'open-items' });
  });

  it('a tool call with a bad card names the reason and adds nothing', async () => {
    const { call } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    // The tool's input schema is the card schema itself, so the MCP layer refuses it before any slice runs.
    await expect(call('add_items', { runId, items: [{ kind: 'card', fields: { ...card(), title: '' } }] })).rejects.toThrow(/title/);
    const list = await call('list_runs', { project: 'MiPlan' });
    expect(list.runs[0].items).toEqual([]);
  });
});

describe('HTTP security', () => {
  it('rejects a wrong token, a missing or foreign Origin on writes, and a foreign Host', async () => {
    const { call, opened } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const [port, token] = [portOf(opened[0]!), tokenOf(opened[0]!)];
    const ev = { type: 'message', threadId: 'x', text: 'hi' };
    expect((await http(port, `/api/state?run=${runId}`, { token: 'nope' })).status).toBe(401);
    expect((await http(port, `/api/state?run=${runId}`)).status).toBe(401);
    expect((await http(port, `/api/event?run=${runId}`, { method: 'POST', token, body: ev, origin: null })).status).toBe(403);
    expect((await http(port, `/api/event?run=${runId}`, { method: 'POST', token, body: ev, origin: 'https://evil.example' })).status).toBe(403);
    expect((await http(port, `/api/state?run=${runId}`, { token, host: 'evil.example' })).status).toBe(421);
    expect((await http(port, `/api/state?run=${runId}`, { token })).status).toBe(200);
  });

  it('hello proves the server holds the token without the page ever sending it', async () => {
    const { call, opened } = await boot();
    const { runId } = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const [port, token] = [portOf(opened[0]!), tokenOf(opened[0]!)];
    const nonce = 'ab'.repeat(16);
    const r = await http(port, `/api/hello?run=${runId}&nonce=${nonce}`);
    expect(r.status).toBe(200);
    expect(r.json.proof).toBe(createHmac('sha256', token).update(`workbench-hello|${nonce}|${port}`).digest('hex'));
    expect(JSON.stringify(r.json)).not.toContain(token);
    expect((await http(port, `/api/hello?run=nope&nonce=${nonce}`)).status).toBe(404);
    expect((await http(port, `/api/hello?run=${runId}&nonce=short`)).status).toBe(404);
  });

  it('a token for one run does not open another', async () => {
    const { call, opened } = await boot();
    const a = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 'a' });
    const b = await call('open_session', { skill: 'card', project: 'MiPlan', subject: 'b' });
    const port = portOf(opened[0]!);
    expect((await http(port, `/api/state?run=${b.runId}`, { token: tokenOf(opened[0]!) })).status).toBe(401);
    expect((await http(port, `/api/state?run=${a.runId}`, { token: tokenOf(opened[0]!) })).status).toBe(200);
  });

  it("a server neither signs nor accepts a run it isn't serving, even with that run's token from disk", async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-two-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const a = await boot(root);
    const { runId } = await a.call('open_session', { skill: 'card', project: 'MiPlan', subject: 'a' });
    const token = tokenOf(a.opened[0]!);
    const b = await boot(root);
    await b.call('open_session', { skill: 'card', project: 'MiPlan', subject: 'b' });
    const portB = portOf(b.opened[0]!);
    expect((await http(portB, `/api/hello?run=${runId}&nonce=${'ab'.repeat(16)}`)).status).toBe(404);
    expect((await http(portB, `/api/state?run=${runId}`, { token })).status).toBe(401);
  });

  it('never serves files outside the page folder', async () => {
    const { call, opened } = await boot();
    await call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const port = portOf(opened[0]!);
    expect((await http(port, '/../../../etc/passwd')).status).toBe(404);
    expect((await http(port, '/%2e%2e/%2e%2e/etc/passwd')).status).toBe(404);
  });
});

describe('durability', () => {
  it('a new server resumes a run: same token, and logged events the old one never applied are replayed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-durable-'));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const first = await boot(root);
    const { runId } = await first.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's' });
    const { added } = await first.call('add_items', { runId, items: [{ kind: 'card', fields: card() }] });
    const token = tokenOf(first.opened[0]!);
    // Simulate a crash after the event hit the log but before the state was saved.
    await first.wb.log.append(runId, { type: 'verdict', itemId: added[0].id, rev: 1, value: 'rejected', at: new Date().toISOString() });
    await first.wb.shutdown('crash');

    const second = await boot(root);
    const resumed = await second.call('open_session', { skill: 'card', project: 'MiPlan', subject: 's', resume: runId });
    expect(resumed.resumed).toBe(true);
    expect(tokenOf(second.opened[0]!)).toBe(token);
    expect(resumed.events.map((e: any) => e.verdict)).toEqual(['rejected']);
    const list = await second.call('list_runs', { project: 'MiPlan' });
    expect(list.runs[0].items[0].verdict).toBe('rejected');
  });
});
