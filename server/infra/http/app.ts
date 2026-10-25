/**
 * The page's HTTP surface, on 127.0.0.1 only.
 *
 * Static files (the page itself) need no token: the token travels after the
 * `#` in the page address and the page sends it in a header, but only after
 * /api/hello has proven this server holds it. Every other /api call passes
 * three checks: Host must be this server (blocks DNS rebinding),
 * Origin must be this server on anything that writes (blocks other websites),
 * and the run's token must match, compared in constant time.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { BUILD } from '../../../shared/constants.ts';
import { TOKEN_HEADER, type LiveEntry } from '../../../shared/contract.ts';
import { WorkbenchError } from '../../kernel/errors.ts';
import type { PageHub } from './hub.ts';

export interface HttpDeps {
  port: () => number;
  /** The token of a run THIS server is serving; undefined for any other run, even one on disk. */
  token: (runId: string) => Promise<string | undefined>;
  hub: PageHub;
  /** Loads the run so a page opened before any change still gets state. */
  ensureState: (runId: string) => Promise<void>;
  recordEvent: (runId: string, body: unknown) => Promise<{ seq: number; imageWarning?: string }>;
  imageFile: (runId: string, name: string) => Promise<string>;
  liveRuns: () => Promise<LiveEntry[]>;
  /** Whether Claude currently holds a wait for the run: decides "your turn". */
  waiting: (runId: string) => boolean;
  clientDir: string;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
};

/** What only the server holding the token, answering on this port, can produce. Mirrored in client/infra/api.ts. */
export const helloProof = (token: string, nonce: string, port: number) =>
  createHmac('sha256', token).update(`workbench-hello|${nonce}|${port}`).digest('hex');

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createApp(deps: HttpDeps): Hono {
  const app = new Hono();
  const own = () => [`127.0.0.1:${deps.port()}`, `localhost:${deps.port()}`];

  app.use('*', async (c, next) => {
    if (!own().includes(c.req.header('host') ?? '')) return c.text('wrong host', 421);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Cache-Control', 'no-store');
    await next();
  });

  // Identity check the page runs on every (re)connect, BEFORE it sends its token anywhere:
  // the page sends a random nonce, we answer HMAC(token, "workbench-hello|nonce|our port"),
  // and it checks that against the port it is actually talking to. A server that isn't ours
  // can't answer, and can't relay our answer either: it would carry our port, not its own.
  app.get('/api/hello', async (c) => {
    const runId = c.req.query('run') ?? '';
    const nonce = c.req.query('nonce') ?? '';
    const token = runId ? await deps.token(runId) : undefined;
    // The build goes out even when the run is unknown: a page from an older build must learn to reload.
    if (!token || !/^[0-9a-f]{32,128}$/.test(nonce)) return c.json({ error: 'unknown run or bad nonce', server: 'workbench', build: BUILD }, 404);
    return c.json({ server: 'workbench', build: BUILD, run: runId, proof: helloProof(token, nonce, deps.port()) });
  });

  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin');
    if (c.req.method !== 'GET' && !(origin && own().some((h) => origin === `http://${h}`))) return c.json({ error: 'foreign origin' }, 403);
    const runId = c.req.query('run') ?? '';
    const expected = runId ? await deps.token(runId) : undefined;
    const given = c.req.header(TOKEN_HEADER) ?? '';
    if (!expected || !sameToken(given, expected)) return c.json({ error: 'not authorised for this run' }, 401);
    await next();
  });

  app.get('/api/state', async (c) => {
    const runId = c.req.query('run')!;
    await deps.ensureState(runId);
    const state = deps.hub.current(runId);
    return state ? c.json({ state, waiting: deps.waiting(runId) }) : c.json({ error: 'no such run' }, 404);
  });

  app.get('/api/stream', async (c) => {
    const runId = c.req.query('run')!;
    await deps.ensureState(runId);
    return streamSSE(c, async (stream) => {
      let open = true;
      const off = deps.hub.subscribe(runId, (msg) => {
        if (!open) return;
        const payload = msg.type === 'state' ? { ...msg, waiting: deps.waiting(runId) } : msg;
        void stream.writeSSE({ event: msg.type, data: JSON.stringify(payload) });
      });
      stream.onAbort(() => { open = false; off(); });
      while (open) {
        await stream.sleep(15_000);
        if (open) await stream.writeSSE({ event: 'ping', data: JSON.stringify({ waiting: deps.waiting(runId) }) });
      }
    });
  });

  app.post('/api/event', async (c) => {
    const runId = c.req.query('run')!;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'body is not JSON' }, 400);
    }
    try {
      return c.json(await deps.recordEvent(runId, body));
    } catch (e) {
      if (e instanceof WorkbenchError) {
        const status = e.code === 'not-found' ? 404 : e.code === 'limit' ? 413 : e.code === 'invalid' ? 400 : 409;
        return c.json({ error: e.message, code: e.code }, status);
      }
      throw e;
    }
  });

  app.get('/api/image', async (c) => {
    try {
      const file = await deps.imageFile(c.req.query('run')!, c.req.query('name') ?? '');
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      return c.body(await readFile(file), 200, { 'Content-Type': type });
    } catch {
      return c.json({ error: 'no such image' }, 404);
    }
  });

  // The "Open reviews" switcher: other live runs on this machine, with working links.
  app.get('/api/runs', async (c) => c.json({ runs: await deps.liveRuns() }));

  app.get('*', async (c) => {
    const rel = c.req.path === '/' ? 'index.html' : normalize(c.req.path).replace(/^([/\\])+/, '');
    if (rel.includes('..')) return c.text('not found', 404);
    try {
      const body = await readFile(join(deps.clientDir, rel));
      const type = TYPES[extname(rel)] ?? 'application/octet-stream';
      return c.body(body, 200, {
        'Content-Type': type,
        ...(rel === 'index.html'
          ? { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" }
          : {}),
      });
    } catch {
      return c.text('not found', 404);
    }
  });

  return app;
}
