/**
 * What the page needs from the outside world, as contracts. client/infra implements
 * them (`class … implements …`), and tests can stand in their own.
 */
import type { LiveEntry, PageEvent, RunState } from '@shared/contract.ts';
import type { Connection, Presence } from './state.ts';

/** Text and picks the user hasn't sent yet, kept per run so a reload loses nothing. */
export interface DraftStore {
  load<T>(key: string, fallback: T): T;
  save(key: string, value: unknown): void;
}

/** What the live feed reports as it follows the server. */
export interface FeedListener {
  state: (run: RunState, presence: Presence) => void;
  presence: (presence: Presence) => void;
  connection: (connection: Connection) => void;
  nudge?: (text: string) => void;
}

export interface SentEvent {
  seq: number;
  imageWarning?: string;
}

/** Claude's session, as the page talks to it. */
export interface WorkbenchServer {
  sendEvent(event: PageEvent): Promise<SentEvent>;
  liveRuns(): Promise<LiveEntry[]>;
  /** A stored image as a blob URL (an <img> can't send the token header). */
  imageBlob(name: string): Promise<string>;
  /** Follows the run's live updates until the returned function is called. */
  follow(listener: FeedListener): () => void;
}
