import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApi, proofFor } from './api.ts';

const session = { runId: 'r1', token: 'the-secret-token' };
const PAGE_PORT = '51234';
const serverProof = (nonce: string, port: string) => createHmac('sha256', session.token).update(`workbench-hello|${nonce}|${port}`).digest('hex');

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
      return new Response(JSON.stringify({ server: 'workbench', run: 'r1', proof }));
    }
    return new Response(JSON.stringify({ runs: [] }));
  });
  return seen;
}
const leaked = (seen: { url: string; headers: Record<string, string> }[]) =>
  seen.some((r) => r.url.includes(session.token) || Object.values(r.headers).includes(session.token));

describe('the identity check', () => {
  it("matches the server's HMAC for the same nonce and port", async () => {
    expect(await proofFor(session.token, 'n', '1')).toBe(serverProof('n', '1'));
  });

  it('never sends the token in hello itself', async () => {
    const seen = server(PAGE_PORT);
    expect(await createApi(session).hello()).toBe(true);
    expect(leaked(seen)).toBe(false);
  });

  it('a server that cannot prove the token never receives it', async () => {
    const seen = server('garbage');
    const api = createApi(session);
    expect(await api.hello()).toBe(false);
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
    expect(leaked(seen)).toBe(false);
  });

  it('an impostor relaying a real proof from another port is rejected and never gets the token', async () => {
    const seen = server('52000');
    const api = createApi(session);
    expect(await api.hello()).toBe(false);
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
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
