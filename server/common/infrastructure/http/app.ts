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
import { BUILD, STREAM_EVENT } from '@shared/constants.ts';
import { TOKEN_HEADER, type LiveEntry } from '@shared/contract.ts';
import { WorkbenchError } from '@server/common/domain/errors.ts';
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
  claudeListening: (runId: string) => boolean;
  /** When Claude last called a tool on the run (ms since epoch), so the page can tell working from gone quiet. */
  claudeActiveAt: (runId: string) => number | undefined;
  clientDir: string;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * What only the server holding the token, answering on this port, as this build, can produce.
 * FROZEN FORMAT: pages from older builds must verify newer servers with it, so it never changes.
 * Mirrored in client/common/infrastructure/identity.ts.
 */
export const helloProof = (token: string, nonce: string, port: number, build: string) =>
  createHmac('sha256', token).update(`workbench-hello|${nonce}|${port}|${build}`).digest('hex');

const sameToken = (given: string, expected: string) => {
  const givenBytes = Buffer.from(given),
    expectedBytes = Buffer.from(expected);
  return givenBytes.length === expectedBytes.length && timingSafeEqual(givenBytes, expectedBytes);
};

/** Every rule a page event can break, and the status it answers with: a new code must pick one. */
const HTTP_STATUS = {
  'not-found': 404,
  invalid: 400,
  limit: 413,
  'stale-revision': 409,
  'open-questions': 409,
  'open-items': 409,
  'thread-mismatch': 409,
  closed: 409,
} as const satisfies Record<WorkbenchError['code'], number>;

export function createApp(deps: HttpDeps): Hono {
  const app = new Hono();
  const own = () => [`127.0.0.1:${deps.port()}`, `localhost:${deps.port()}`];
  /** What the page needs to say whose turn it is, sent with every state and keep-alive. */
  const claudeActivity = (runId: string) => ({
    claudeListening: deps.claudeListening(runId),
    claudeActiveAt: deps.claudeActiveAt(runId) ?? null,
  });

  app.use('*', async (context, next) => {
    if (!own().includes(context.req.header('host') ?? '')) {
      return context.text('wrong host', 421);
    }
    context.header('X-Content-Type-Options', 'nosniff');
    context.header('Referrer-Policy', 'no-referrer');
    context.header('Cache-Control', 'no-store');
    await next();
  });

  // Identity check the page runs on every (re)connect, BEFORE it sends its token anywhere:
  // the page sends a random nonce, we answer HMAC(token, "workbench-hello|nonce|our port"),
  // and it checks that against the port it is actually talking to. A server that isn't ours
  // can't answer, and can't relay our answer either: it would carry our port, not its own.
  app.get('/api/hello', async (context) => {
    const runId = context.req.query('run') ?? '';
    const nonce = context.req.query('nonce') ?? '';
    const token = runId ? await deps.token(runId) : undefined;
    if (!token || !/^[0-9a-f]{32,128}$/.test(nonce)) {
      return context.json({ error: 'unknown run or bad nonce' }, 404);
    }
    // The build is inside the proof, so a page only believes "you're on an older build" from a server that holds the token.
    return context.json({
      server: 'workbench',
      build: BUILD,
      run: runId,
      proof: helloProof(token, nonce, deps.port(), BUILD),
    });
  });

  app.use('/api/*', async (context, next) => {
    const origin = context.req.header('origin');
    if (context.req.method !== 'GET' && !(origin && own().some((host) => origin === `http://${host}`))) {
      return context.json({ error: 'foreign origin' }, 403);
    }
    const runId = context.req.query('run') ?? '';
    const expected = runId ? await deps.token(runId) : undefined;
    const given = context.req.header(TOKEN_HEADER) ?? '';
    if (!expected || !sameToken(given, expected)) {
      return context.json({ error: 'not authorised for this run' }, 401);
    }
    await next();
  });

  app.get('/api/state', async (context) => {
    const runId = context.req.query('run')!;
    await deps.ensureState(runId);
    const state = deps.hub.current(runId);
    return state ? context.json({ state, ...claudeActivity(runId) }) : context.json({ error: 'no such run' }, 404);
  });

  app.get('/api/stream', async (context) => {
    const runId = context.req.query('run')!;
    await deps.ensureState(runId);
    return streamSSE(context, async (stream) => {
      let open = true;
      const off = deps.hub.subscribe(runId, (msg) => {
        if (!open) {
          return;
        }
        const payload = msg.type === STREAM_EVENT.state ? { ...msg, ...claudeActivity(runId) } : msg;
        void stream.writeSSE({ event: msg.type, data: JSON.stringify(payload) });
      });
      stream.onAbort(() => {
        open = false;
        off();
      });
      while (open) {
        await stream.sleep(15_000);
        if (open) {
          await stream.writeSSE({ event: STREAM_EVENT.ping, data: JSON.stringify(claudeActivity(runId)) });
        }
      }
    });
  });

  app.post('/api/event', async (context) => {
    const runId = context.req.query('run')!;
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'body is not JSON' }, 400);
    }
    try {
      return context.json(await deps.recordEvent(runId, body));
    } catch (error) {
      if (error instanceof WorkbenchError) {
        return context.json({ error: error.message, code: error.code }, HTTP_STATUS[error.code]);
      }
      throw error;
    }
  });

  app.get('/api/image', async (context) => {
    try {
      const file = await deps.imageFile(context.req.query('run')!, context.req.query('name') ?? '');
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      return context.body(await readFile(file), 200, { 'Content-Type': type });
    } catch {
      return context.json({ error: 'no such image' }, 404);
    }
  });

  // The "Open reviews" switcher: other live runs on this machine, with working links.
  app.get('/api/runs', async (context) => context.json({ runs: await deps.liveRuns() }));

  app.get('*', async (context) => {
    const rel = context.req.path === '/' ? 'index.html' : normalize(context.req.path).replace(/^([/\\])+/, '');
    if (rel.includes('..')) {
      return context.text('not found', 404);
    }
    try {
      const body = await readFile(join(deps.clientDir, rel));
      const type = TYPES[extname(rel)] ?? 'application/octet-stream';
      return context.body(body, 200, {
        'Content-Type': type,
        ...(rel === 'index.html'
          ? {
              'Content-Security-Policy':
                "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
            }
          : {}),
      });
    } catch {
      return context.text('not found', 404);
    }
  });

  return app;
}
