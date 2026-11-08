import type { LiveEntry, PageEvent, RunState } from '@shared/contract.ts';
import type { Connection } from '@client/common/domain/connection.ts';
import type { ClaudeActivity } from '@client/common/domain/state.ts';

/** What the live feed reports as it follows the server. */
export interface FeedListener {
  state: (run: RunState, activity: ClaudeActivity) => void;
  claudeActivity: (activity: ClaudeActivity) => void;
  connection: (connection: Connection) => void;
  nudge?: (text: string) => void;
}

export interface SentEvent {
  seq: number;
  imageWarning?: string;
}

/** Claude's session, as the page talks to it. client/common/infrastructure implements it; tests stand in their own. */
export abstract class HidalgoServer {
  abstract sendEvent(event: PageEvent): Promise<SentEvent>;
  abstract liveRuns(): Promise<LiveEntry[]>;
  /** A stored image as a blob URL (an <img> can't send the token header). */
  abstract imageBlob(name: string): Promise<string>;
  /** Follows the run's live updates until the returned function is called. */
  abstract follow(listener: FeedListener): () => void;
}
