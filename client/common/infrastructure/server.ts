/**
 * The page's only door to Claude's session. The token goes in a header, and only to a
 * server that proved, on this connection, that it holds it (identity.ts).
 */
import { TOKEN_HEADER } from '@shared/constants.ts';
import type { LiveEntry, PageEvent } from '@shared/contract.ts';
import type { FeedListener, SentEvent, WorkbenchServer } from '@client/common/ports/workbench-server.port.ts';
import { ApiError, NotConnectedError } from '@client/common/domain/errors.ts';
import { IDENTITY, type Identity, proveServer } from './identity.ts';
import { LiveFeed, RETRY, type ProvableServer, type RetryPolicy } from './live-feed.ts';
import type { Session } from './session.ts';

export class HttpWorkbenchServer implements WorkbenchServer, ProvableServer {
  private proven = false;
  /** Image names are content hashes, so one blob URL per name serves every view for the tab's life. */
  private readonly blobs = new Map<string, Promise<string>>();

  constructor(
    private readonly session: Session,
    private readonly retry: RetryPolicy = RETRY,
  ) {}

  sendEvent(event: PageEvent): Promise<SentEvent> {
    return this.request<SentEvent>('event', {
      method: 'POST',
      body: JSON.stringify(event),
      headers: { 'content-type': 'application/json' },
    });
  }

  async liveRuns(): Promise<LiveEntry[]> {
    const body = await this.request<{ runs: LiveEntry[] }>('runs');
    return body.runs;
  }

  imageBlob(name: string): Promise<string> {
    const cached = this.blobs.get(name);
    if (cached) {
      return cached;
    }
    const loading = this.fetchImage(name);
    this.blobs.set(name, loading);
    // A failed load isn't cached: the next view tries again.
    loading.catch(() => this.blobs.delete(name));
    return loading;
  }

  follow(listener: FeedListener): () => void {
    const feed = new LiveFeed(this, listener, this.retry);
    feed.start();
    return () => feed.stop();
  }

  // ---- used by the live feed ----

  async prove(): Promise<Identity> {
    this.proven = false;
    const identity = await proveServer(this.session);
    this.proven = identity === IDENTITY.proven;
    return identity;
  }

  forget(): void {
    this.proven = false;
  }

  openStream(signal: AbortSignal): Promise<Response> {
    this.requireProven();
    return fetch(this.address('stream'), { headers: this.tokenHeader(), signal });
  }

  // ---- internals ----

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    this.requireProven();
    const response = await fetch(this.address(path), { ...init, headers: { ...this.tokenHeader(), ...init.headers } });
    const body: T & ErrorBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, body.error ?? response.statusText, body.code);
    }
    return body;
  }

  private async fetchImage(name: string): Promise<string> {
    this.requireProven();
    const response = await fetch(this.address('image', { name }), { headers: this.tokenHeader() });
    if (!response.ok) {
      throw new ApiError(response.status, 'image unavailable');
    }
    return URL.createObjectURL(await response.blob());
  }

  private requireProven(): void {
    if (!this.proven) {
      throw new NotConnectedError();
    }
  }

  private address(path: string, params: Record<string, string> = {}): string {
    const query = new URLSearchParams({ run: this.session.runId, ...params });
    return `/api/${path}?${query}`;
  }

  private tokenHeader(): Record<string, string> {
    return { [TOKEN_HEADER]: this.session.token };
  }
}

/** What a refusal carries besides its status. */
interface ErrorBody {
  error?: string;
  code?: string;
}
