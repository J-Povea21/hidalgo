import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApi, proofFor } from './api.ts';

const session = { runId: 'r1', token: 'the-secret-token' };
afterEach(() => vi.unstubAllGlobals());

/** A stand-in server: records every request; answers hello with a real or a wrong proof. */
function server(honest: boolean) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.startsWith('/api/hello')) {
      const nonce = new URL(url, 'http://x').searchParams.get('nonce')!;
      const proof = honest ? createHmac('sha256', session.token).update(nonce).digest('hex') : 'f'.repeat(64);
      return new Response(JSON.stringify({ server: 'workbench', run: 'r1', proof }));
    }
    return new Response(JSON.stringify({ runs: [] }));
  });
  return seen;
}
const leaked = (seen: { url: string; headers: Record<string, string> }[]) =>
  seen.some((r) => r.url.includes(session.token) || Object.values(r.headers).includes(session.token));

describe('the identity check', () => {
  it("matches the server's HMAC", async () => {
    expect(await proofFor('k', 'n')).toBe(createHmac('sha256', 'k').update('n').digest('hex'));
  });

  it('never sends the token in hello itself', async () => {
    const seen = server(true);
    expect(await createApi(session).hello()).toBe(true);
    expect(leaked(seen)).toBe(false);
  });

  it('a server that cannot prove the token never receives it', async () => {
    const seen = server(false);
    const api = createApi(session);
    expect(await api.hello()).toBe(false);
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
    expect(leaked(seen)).toBe(false);
  });

  it('sends the token only after the proof checks out', async () => {
    const seen = server(true);
    const api = createApi(session);
    await expect(api.liveRuns()).rejects.toThrow(/Not connected/);
    expect(leaked(seen)).toBe(false);
    await api.hello();
    await api.liveRuns();
    expect(seen.at(-1)!.headers['x-workbench-token']).toBe(session.token);
  });
});
