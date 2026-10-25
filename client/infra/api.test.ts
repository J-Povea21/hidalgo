import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, proofFor } from './api.ts';

const session = { runId: 'r1', token: 'the-secret-token' };
const PAGE_PORT = '51234';
const serverProof = (nonce: string, port: string, build = 'dev') =>
  createHmac('sha256', session.token).update(`workbench-hello|${nonce}|${port}|${build}`).digest('hex');

beforeEach(() => vi.stubGlobal('location', new URL(`http://127.0.0.1:${PAGE_PORT}/`)));
afterEach(() => vi.unstubAllGlobals());

/**
 * A stand-in for whatever answers on the page's port. It records every
 * request, and answers hello with a proof made for `signedPort`: the page's own
 * port for the real server, another port for an impostor relaying the real one.
 */
function server(signedPort: string | 'garbage') {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.startsWith('/api/hello')) {
      const nonce = new URL(url, 'http://x').searchParams.get('nonce')!;
      const proof = signedPort === 'garbage' ? 'f'.repeat(64) : serverProof(nonce, signedPort);
      return new Response(JSON.stringify({ server: 'workbench', build: 'dev', run: 'r1', proof }));
    }
    return new Response(JSON.stringify({ runs: [] }));
  });
  return seen;
}
const leaked = (seen: { url: string; headers: Record<string, string> }[]) =>
  seen.some((r) => r.url.includes(session.token) || Object.values(r.headers).includes(session.token));

describe('following the session', () => {
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 200 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
  };

  it('after a goodbye and a server that is gone for a while, reconnects by itself when it comes back', async () => {
    let phase: 'first' | 'down' | 'back' = 'first';
    vi.stubGlobal('fetch', async (url: string) => {
      if (phase === 'down') throw new TypeError('connection refused');
      if (url.startsWith('/api/hello')) {
        const nonce = new URL(url, 'http://x').searchParams.get('nonce')!;
        return new Response(JSON.stringify({ server: 'workbench', build: 'dev', run: 'r1', proof: serverProof(nonce, PAGE_PORT) }));
      }
      if (url.startsWith('/api/stream')) {
        if (phase === 'first') { phase = 'down'; return new Response('event: goodbye\ndata: {"reason":"session ended"}\n\n'); }
        return new Response(`event: state\ndata: ${JSON.stringify({ state: { id: 'r1', version: 9 }, claudeListening: true, claudeActiveAt: 1 })}\n\n`);
      }
      return new Response('{}');
    });
    const seen: string[] = [];
    const states: number[] = [];
    const stop = createApi(session).follow({
      state: (run) => states.push(run.version),
      presence: () => {},
      connection: (c) => seen.push(c.kind),
    }, { baseMs: 2, maxMs: 10 });
    await until(() => seen.includes('ended') && seen.length > 3);
    expect(seen.slice(0, 2)).toEqual(['live', 'ended']);
    expect(states).toEqual([]);
    phase = 'back';
    await until(() => states.includes(9));
    expect(states).toContain(9);
    stop();
  });
});

describe('the identity check', () => {
  it("matches the server's HMAC for the same nonce and port", async () => {
    expect(await proofFor(session.token, 'n', '1', 'b1')).toBe(serverProof('n', '1', 'b1'));
  });

  it('never sends the token in hello itself', async () => {
    const seen = server(PAGE_PORT);
    expect(await createApi(session).hello()).toBe('proven');
    expect(leaked(seen)).toBe(false);
  });

  it('a server that cannot prove the token never receives it', async () => {
    const seen = server('garbage');
    const api = createApi(session);
    expect(await api.hello()).toBe('no');
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
    expect(leaked(seen)).toBe(false);
  });

  it('an impostor relaying a real proof from another port is rejected and never gets the token', async () => {
    const seen = server('52000');
    const api = createApi(session);
    expect(await api.hello()).toBe('no');
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
    expect(leaked(seen)).toBe(false);
  });

  /** A server that claims build `build`, with a real proof of it or a forged one. */
  function claims(build: string, proves: boolean) {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      const nonce = new URL(url, 'http://x').searchParams.get('nonce')!;
      const proof = proves ? serverProof(nonce, PAGE_PORT, build) : 'f'.repeat(64);
      return new Response(JSON.stringify({ server: 'workbench', build, run: 'r1', proof }));
    });
    return seen;
  }

  it('the real server on a newer build makes the page stale, and gets no token', async () => {
    const seen = claims('newer', true);
    expect(await createApi(session).hello()).toBe('stale');
    expect(leaked(seen)).toBe(false);
  });

  it('a stranger merely claiming a newer build is not believed: no stale banner, no token', async () => {
    const seen = claims('newer', false);
    expect(await createApi(session).hello()).toBe('no');
    expect(leaked(seen)).toBe(false);
  });

  it('sends the token only after the proof checks out', async () => {
    const seen = server(PAGE_PORT);
    const api = createApi(session);
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
    expect(leaked(seen)).toBe(false);
    await api.hello();
    await api.liveRuns();
    expect(seen.at(-1)!.headers['x-workbench-token']).toBe(session.token);
  });
});
