/**
 * The page's only door to the server. The run id and token come from the
 * address fragment (never sent to the server in the URL); the token goes in a
 * header on every call. Before trusting a (re)connection, the page asks the
 * server to prove it owns this run: if another program took the port, nothing
 * is ever sent to it.
 */
import { TOKEN_HEADER } from '../../shared/constants.ts';
import type { LiveEntry, PageEvent, RunState } from '../../shared/contract.ts';
import type { Connection } from '../core/state.ts';

export interface Session { runId: string; token: string }

export function sessionFromLocation(hash = location.hash): Session | undefined {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const runId = p.get('run'), token = p.get('t');
  return runId && token ? { runId, token } : undefined;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}

export function createApi(s: Session) {
  const q = `run=${encodeURIComponent(s.runId)}`;
  const headers = { [TOKEN_HEADER]: s.token };

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api/${path}${path.includes('?') ? '&' : '?'}${q}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (body as { error?: string }).error ?? res.statusText, (body as { code?: string }).code);
    return body as T;
  }

  /** True only if the server at this address proves it serves this run with this token. */
  async function hello(): Promise<boolean> {
    try {
      const r = await call<{ server?: string; run?: string }>('hello');
      return r.server === 'workbench' && r.run === s.runId;
    } catch {
      return false;
    }
  }

  return {
    hello,
    sendEvent: (event: PageEvent) =>
      call<{ seq: number; imageWarning?: string }>('event', { method: 'POST', body: JSON.stringify(event), headers: { 'content-type': 'application/json' } }),
    liveRuns: () => call<{ runs: LiveEntry[] }>('runs').then((r) => r.runs),
    /** Fetches an image with the token (an <img> can't send headers) and returns a blob URL. */
    imageBlob: async (name: string) => URL.createObjectURL(await (await fetch(`/api/image?${q}&name=${encodeURIComponent(name)}`, { headers })).blob()),

    /**
     * Follows the server's live updates. Reconnects on its own; reports how the
     * connection stands so the page can say so. Returns a function that stops it.
     */
    follow(on: {
      state: (run: RunState, waiting: boolean) => void;
      waiting: (waiting: boolean) => void;
      connection: (c: Connection) => void;
    }): () => void {
      let stopped = false;
      let controller: AbortController | undefined;
      let downSince = 0;

      const loop = async () => {
        while (!stopped) {
          if (!(await hello())) {
            // Reachable but not ours: never send it anything again.
            const reachable = await fetch('/', { method: 'HEAD' }).then(() => true, () => false);
            if (reachable && downSince === 0) { on.connection({ kind: 'moved' }); return; }
            downSince ||= Date.now();
            on.connection(Date.now() - downSince > 15_000 ? { kind: 'lost' } : { kind: 'reconnecting', since: downSince });
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          downSince = 0;
          controller = new AbortController();
          try {
            const res = await fetch(`/api/stream?${q}`, { headers, signal: controller.signal });
            if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
            await readSse(res.body, (event, data) => {
              const msg = JSON.parse(data);
              if (event === 'state') on.state(msg.state, msg.waiting);
              else if (event === 'ping') on.waiting(msg.waiting);
              else if (event === 'goodbye') { on.connection({ kind: 'ended', reason: msg.reason }); stopped = true; controller?.abort(); }
            });
          } catch {
            if (stopped) return;
          }
          if (!stopped) {
            downSince ||= Date.now();
            on.connection({ kind: 'reconnecting', since: downSince });
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      };
      void loop();
      return () => { stopped = true; controller?.abort(); };
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** Minimal SSE reader over a fetch body (EventSource can't send headers). */
async function readSse(body: ReadableStream<Uint8Array>, on: (event: string, data: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) on(event, data);
    }
  }
}
