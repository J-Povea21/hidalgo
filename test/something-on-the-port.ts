import { createHmac } from 'node:crypto';
import { vi } from 'vitest';
import { STREAM_EVENT, TOKEN_HEADER } from '@shared/constants.ts';

export const SESSION = { runId: 'r1', token: 'the-secret-token' };
export const PAGE_PORT = '51234';
const OTHER_PORT = '52000';
const FORGED_PROOF = 'f'.repeat(64);

/** The proof only the server holding the token can make, for this nonce, port and build. */
export function realProof(nonce: string, port = PAGE_PORT, build = 'dev'): string {
  return createHmac('sha256', SESSION.token).update(`hidalgo-hello|${nonce}|${port}|${build}`).digest('hex');
}

/** Puts the page at its address, as the browser would. */
export function pageOpenedOnItsPort() {
  vi.stubGlobal('location', new URL(`http://127.0.0.1:${PAGE_PORT}/`));
}

interface PortOptions {
  /** Who is answering, and so what proof comes back from hello. */
  answering: 'the real server' | 'an impostor relaying the real proof' | 'a stranger';
  /** The build the answer claims. */
  build?: string;
}

/** One scripted answer to a stream request, and whether the port goes down once it is served. */
interface ScriptedStream {
  body: string;
  thenDown: boolean;
}

interface Request {
  url: string;
  headers: Headers;
}

/**
 * Whatever answers on the page's port, played by a test: the real server, an impostor
 * relaying the real server's proof from another port, or a stranger who can't prove
 * anything. It records every request, so a test can say whether the token left the page.
 */
export class SomethingOnThePort {
  readonly requests: Request[] = [];
  /** What each stream request gets, in order: an event to send, then the stream ends. */
  private readonly streams: ScriptedStream[] = [];
  private down = false;

  constructor(private readonly options: PortOptions) {
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => this.answer(url, init));
  }

  /** The next stream sends this event, then ends. */
  willStream(event: string, data: unknown): this {
    this.streams.push({ body: `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`, thenDown: false });
    return this;
  }

  willSayGoodbye(reason: string): this {
    return this.willStream(STREAM_EVENT.goodbye, { reason });
  }

  /**
   * The port goes down the moment the stream queued last is served, before the page can
   * retry, so no test races the page's reconnect to take it down.
   */
  thenGoesDown(): this {
    const last = this.streams.at(-1);
    if (last !== undefined) {
      last.thenDown = true;
    }
    return this;
  }

  comesBack(): void {
    this.down = false;
  }

  /** Whether any request so far carried the run's token, in a header or in its address. */
  receivedTheToken(): boolean {
    return this.requests.some(
      (request) => request.url.includes(SESSION.token) || request.headers.get(TOKEN_HEADER) === SESSION.token,
    );
  }

  private async answer(url: string, init?: RequestInit): Promise<Response> {
    this.requests.push({ url, headers: new Headers(init?.headers) });
    if (this.down) {
      throw new TypeError('connection refused');
    }
    if (url.startsWith('/api/hello')) {
      return this.hello(new URL(url, 'http://page').searchParams.get('nonce') ?? '');
    }
    if (url.startsWith('/api/stream')) {
      const next = this.streams.shift();
      if (next?.thenDown === true) {
        this.down = true;
      }
      return new Response(next?.body ?? '');
    }
    return new Response(JSON.stringify({ runs: [] }));
  }

  private hello(nonce: string): Response {
    const build = this.options.build ?? 'dev';
    const proof = {
      'the real server': realProof(nonce, PAGE_PORT, build),
      'an impostor relaying the real proof': realProof(nonce, OTHER_PORT, build),
      'a stranger': FORGED_PROOF,
    }[this.options.answering];
    return new Response(JSON.stringify({ server: 'hidalgo', run: SESSION.runId, build, proof }));
  }
}
