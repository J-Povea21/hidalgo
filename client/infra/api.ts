/**
 * The page's only door to the server. The run id and token come from the
 * address fragment (never sent to the server in the URL); the token goes in a
 * header on every call. Before trusting a (re)connection, the page asks the
 * server to prove it owns this run: if another program took the port, nothing
 * is ever sent to it.
 */
import { BUILD, TOKEN_HEADER } from '@shared/constants.ts';
import type { LiveEntry, PageEvent, RunState } from '@shared/contract.ts';
import { LOST_AFTER_MS, type Connection, type Presence } from '@client/core/state.ts';

export interface Session {
  runId: string;
  token: string;
}

export function sessionFromLocation(hash = location.hash): Session | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const runId = params.get('run'),
    token = params.get('t');
  return runId && token ? { runId, token } : undefined;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * HMAC-SHA256(token, "workbench-hello|nonce|port|build"): what only the server holding the
 * token, answering on this port, as that build, can produce. A proof relayed from another port
 * fails, and a claim of another build counts only when proven. FROZEN FORMAT, so old pages can
 * verify new servers. Mirrors helloProof in server/infra/http/app.ts.
 */
export async function proofFor(token: string, nonce: string, port: string, build: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(token),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`workbench-hello|${nonce}|${port}|${build}`)),
  );
}

/** The port this page is talking to (the address bar's, defaulting like the browser does). */
const pagePort = () => location.port || (location.protocol === 'https:' ? '443' : '80');

export function createApi(session: Session) {
  const runQuery = `run=${encodeURIComponent(session.runId)}`;
  const headers = { [TOKEN_HEADER]: session.token };
  /** The token is sent only to a server that proved, on this connection, that it holds it. */
  let proven = false;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    if (!proven) throw new ApiError(0, "Not connected to Claude's session yet. Your text is kept.");
    const res = await fetch(`/api/${path}${path.includes('?') ? '&' : '?'}${runQuery}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new ApiError(
        res.status,
        (body as { error?: string }).error ?? res.statusText,
        (body as { code?: string }).code,
      );
    return body as T;
  }

  /**
   * Proves the server at this address holds this run's token WITHOUT sending
   * it: a random nonce goes out, HMAC(token, nonce) must come back. Until this
   * succeeds, nothing carrying the token is sent.
   */
  async function hello(): Promise<'proven' | 'stale' | 'no'> {
    proven = false;
    try {
      const nonce = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
      const res = await fetch(`/api/hello?${runQuery}&nonce=${nonce}`);
      if (!res.ok) return 'no';
      const answer = (await res.json()) as { server?: string; build?: string; run?: string; proof?: string };
      if (answer.server !== 'workbench' || answer.run !== session.runId || !answer.build || !answer.proof) return 'no';
      // Nothing in the answer is trusted until the proof, which covers the build, checks out.
      if (answer.proof !== (await proofFor(session.token, nonce, pagePort(), answer.build))) return 'no';
      // The real server, on a newer build: this page predates an update and must be reloaded.
      if (answer.build !== BUILD) return 'stale';
      proven = true;
      return 'proven';
    } catch {
      return 'no';
    }
  }

  /** Image names are content hashes, so one blob URL per name serves every view for the tab's life. */
  const blobs = new Map<string, Promise<string>>();
  async function fetchImage(name: string): Promise<string> {
    if (!proven) throw new ApiError(0, 'not connected');
    const res = await fetch(`/api/image?${runQuery}&name=${encodeURIComponent(name)}`, { headers });
    if (!res.ok) throw new ApiError(res.status, 'image unavailable');
    return URL.createObjectURL(await res.blob());
  }

  return {
    hello,
    sendEvent: (event: PageEvent) =>
      call<{ seq: number; imageWarning?: string }>('event', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'content-type': 'application/json' },
      }),
    liveRuns: () => call<{ runs: LiveEntry[] }>('runs').then((body) => body.runs),
    /** An image as a blob URL (an <img> can't send the token header); cached, retried if it failed. */
    imageBlob(name: string): Promise<string> {
      const cached = blobs.get(name);
      if (cached) return cached;
      const loading = fetchImage(name);
      blobs.set(name, loading);
      loading.catch(() => blobs.delete(name));
      return loading;
    },

    /**
     * Follows the server's live updates. Reconnects on its own and never gives up: a
     * session that ended, a server that moved or crashed may all come back (a /mcp
     * reconnect, a resume), and the tab should find it without a reload. The proof runs
     * on every attempt, so a stranger on the port is knocked on but never handed the
     * token. Reports how the connection stands so the page can say so; returns a stop function.
     */
    follow(
      on: {
        state: (run: RunState, presence: Presence) => void;
        presence: (presence: Presence) => void;
        connection: (c: Connection) => void;
        nudge?: (text: string) => void;
      },
      retry: { baseMs: number; maxMs: number } = { baseMs: 1500, maxMs: 15_000 },
    ): () => void {
      let stopped = false;
      let controller: AbortController | undefined;
      let downSince = 0;
      let failures = 0;

      /** Gaps grow from baseMs, doubling, up to maxMs. */
      const pause = () => {
        const gap = Math.min(retry.baseMs * 2 ** Math.min(failures, 4), retry.maxMs);
        failures += 1;
        return new Promise((resolve) => setTimeout(resolve, gap));
      };

      /** The server didn't prove itself: either nothing is there, or something that isn't this run. */
      const reportUnproven = async () => {
        const reachable = await fetch('/', { method: 'HEAD' }).then(
          () => true,
          () => false,
        );
        if (reachable && downSince === 0) return on.connection({ kind: 'moved' });
        downSince ||= Date.now();
        on.connection(
          Date.now() - downSince > LOST_AFTER_MS ? { kind: 'lost' } : { kind: 'reconnecting', since: downSince },
        );
      };

      /** Reads one stream until it ends; true if it ended with a goodbye. */
      const stream = async (): Promise<boolean> => {
        controller = new AbortController();
        let goodbye = false;
        const presence = (message: Presence): Presence => ({
          claudeListening: message.claudeListening,
          claudeActiveAt: message.claudeActiveAt,
        });
        try {
          const res = await fetch(`/api/stream?${runQuery}`, { headers, signal: controller.signal });
          if (!res.ok || !res.body) return false;
          // A proven server and an open stream: the page is live again, even after a goodbye.
          on.connection({ kind: 'live' });
          await readSse(res.body, (event, data) => {
            const msg = JSON.parse(data);
            if (event === 'state') on.state(msg.state, presence(msg));
            else if (event === 'ping') on.presence(presence(msg));
            else if (event === 'nudge') on.nudge?.(msg.text);
            else if (event === 'goodbye') {
              goodbye = true;
              on.connection({ kind: 'ended', reason: msg.reason });
              controller?.abort();
            }
          });
        } catch {
          // dropped, aborted, or the server went away
        }
        return goodbye;
      };

      const loop = async () => {
        while (!stopped) {
          const identity = await hello();
          if (identity === 'stale') on.connection({ kind: 'stale' });
          else if (identity === 'no') await reportUnproven();
          else {
            downSince = 0;
            failures = 0;
            const goodbye = await stream();
            if (stopped) return;
            // The stream ended: prove the server again before the token goes anywhere.
            proven = false;
            if (!goodbye) {
              downSince ||= Date.now();
              on.connection({ kind: 'reconnecting', since: downSince });
            }
          }
          await pause();
        }
      };
      void loop();
      return () => {
        stopped = true;
        controller?.abort();
      };
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
    let end: number;
    while ((end = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + 2);
      let event = 'message',
        data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) on(event, data);
    }
  }
}
