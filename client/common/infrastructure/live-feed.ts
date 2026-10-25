/**
 * Follows the server's live updates, and says how the connection stands. It reconnects on
 * its own and never gives up: a session that ended, or a server that moved or crashed, may
 * all come back (a /mcp reconnect, a resume), and the tab should find it without a reload.
 * The server proves itself again before every stream, so a stranger on the port is knocked
 * on but never handed the token.
 */
import { STREAM_EVENT } from '@shared/constants.ts';
import type { RunState } from '@shared/contract.ts';
import type { FeedListener } from '@client/common/ports/workbench-server.port.ts';
import { CONNECTION, type Connection, LOST_AFTER_MS, type ClaudeActivity } from '@client/common/domain/state.ts';
import { IDENTITY, type Identity } from './identity.ts';
import { readSse } from './sse.ts';

/** Gaps between attempts start at `firstGapMs` and double, up to `longestGapMs`. */
export interface RetryPolicy {
  firstGapMs: number;
  longestGapMs: number;
}
export const RETRY: RetryPolicy = { firstGapMs: 1500, longestGapMs: 15_000 };
const MAX_DOUBLINGS = 4;

/** What the feed needs from the server: to be proved, forgotten, and streamed from. */
export interface ProvableServer {
  prove(): Promise<Identity>;
  forget(): void;
  openStream(signal: AbortSignal): Promise<Response>;
}

/** Any message on the stream; which fields it carries depends on its event. */
interface StreamMessage extends ClaudeActivity {
  state: RunState;
  text: string;
  reason: string;
}

export class LiveFeed {
  private stopped = false;
  private controller: AbortController | undefined;
  /** When the connection was last lost (ms since epoch), or 0 while it is up. */
  private downSince = 0;
  private failures = 0;

  constructor(
    private readonly server: ProvableServer,
    private readonly listener: FeedListener,
    private readonly retry: RetryPolicy = RETRY,
  ) {}

  start(): void {
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      const identity = await this.server.prove();
      // Stopped while the proof was on its way: open nothing more.
      if (this.stopped) {
        return;
      }
      switch (identity) {
        case IDENTITY.proven:
          await this.followStream();
          break;
        case IDENTITY.stale:
          this.report({ kind: CONNECTION.stale });
          break;
        case IDENTITY.unproven:
          await this.reportUnproven();
          break;
      }
      if (!this.stopped) {
        await this.waitBeforeRetrying();
      }
    }
  }

  /** Opens one stream from a proven server and reads it until it ends. */
  private async followStream(): Promise<void> {
    this.downSince = 0;
    this.failures = 0;
    this.controller = new AbortController();
    let endedWithGoodbye = false;
    try {
      const response = await this.server.openStream(this.controller.signal);
      if (response.ok && response.body) {
        // A proven server and an open stream: the page is live again, even after a goodbye.
        this.report({ kind: CONNECTION.live });
        await readSse(response.body, (event, data) => {
          endedWithGoodbye ||= this.handle(event, JSON.parse(data));
        });
      }
    } catch {
      // Dropped, aborted, or the server went away: the loop tries again.
    }
    // The stream ended: the server proves itself again before the token goes anywhere.
    this.server.forget();
    if (!endedWithGoodbye && !this.stopped) {
      this.downSince ||= Date.now();
      this.report({ kind: CONNECTION.reconnecting, since: this.downSince });
    }
  }

  /** Passes one message on; true if it was the goodbye. */
  private handle(event: string, message: StreamMessage): boolean {
    const activity = { claudeListening: message.claudeListening, claudeActiveAt: message.claudeActiveAt };
    switch (event) {
      case STREAM_EVENT.state:
        this.listener.state(message.state, activity);
        return false;
      case STREAM_EVENT.ping:
        this.listener.claudeActivity(activity);
        return false;
      case STREAM_EVENT.nudge:
        this.listener.nudge?.(message.text);
        return false;
      case STREAM_EVENT.goodbye:
        this.report({ kind: CONNECTION.ended, reason: message.reason });
        this.controller?.abort();
        return true;
      default:
        return false;
    }
  }

  /**
   * The server didn't prove itself. Something answering the page's address while the page
   * was never connected is another program: the run moved. Otherwise the server is down,
   * reconnecting for a while, and then lost.
   */
  private async reportUnproven(): Promise<void> {
    const somethingAnswers = await fetch('/', { method: 'HEAD' }).then(
      () => true,
      () => false,
    );
    if (somethingAnswers && this.downSince === 0) {
      this.report({ kind: CONNECTION.moved });
      return;
    }
    this.downSince ||= Date.now();
    const downTooLong = Date.now() - this.downSince > LOST_AFTER_MS;
    if (downTooLong) {
      this.report({ kind: CONNECTION.lost });
    } else {
      this.report({ kind: CONNECTION.reconnecting, since: this.downSince });
    }
  }

  private waitBeforeRetrying(): Promise<void> {
    const doublings = Math.min(this.failures, MAX_DOUBLINGS);
    const gap = Math.min(this.retry.firstGapMs * 2 ** doublings, this.retry.longestGapMs);
    this.failures += 1;
    return new Promise((resolve) => setTimeout(resolve, gap));
  }

  private report(connection: Connection): void {
    this.listener.connection(connection);
  }
}
