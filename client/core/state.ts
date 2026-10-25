/**
 * The page's state: what the server last sent, and how the connection is.
 * A pure reducer: the server's updates go in, the views read what comes out.
 */
import type { RunState } from '@shared/contract.ts';

export type Connection =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'reconnecting'; since: number }
  /** The server that answered isn't this run's (another program took the port). */
  | { kind: 'moved' }
  /** A workbench of a newer build answered: this page predates an update and must be reloaded. */
  | { kind: 'stale' }
  /** The session said goodbye: it ended normally. */
  | { kind: 'ended'; reason: string }
  /** No goodbye and reconnecting keeps failing. */
  | { kind: 'lost' };

/** Whether Claude is listening, and when it last did anything: sent with every state and keep-alive. */
export interface Presence {
  claudeListening: boolean;
  /** When Claude last called a tool on the run (ms since epoch); null if not since the server started. */
  claudeActiveAt: number | null;
}

export interface PageState extends Presence {
  run?: RunState;
  connection: Connection;
}

export type PageAction =
  | { type: 'state'; run: RunState; presence: Presence }
  | { type: 'presence'; presence: Presence }
  | { type: 'connection'; connection: Connection };

export const initialState: PageState = { claudeListening: false, claudeActiveAt: null, connection: { kind: 'connecting' } };

const samePresence = (s: PageState, p: Presence) => s.claudeListening === p.claudeListening && s.claudeActiveAt === p.claudeActiveAt;

export function reduce(s: PageState, a: PageAction): PageState {
  switch (a.type) {
    case 'state':
      // Never go backwards: a late, older snapshot must not undo a newer one.
      if (s.run && a.run.id === s.run.id && a.run.version < s.run.version) return samePresence(s, a.presence) ? s : { ...s, ...a.presence };
      return { ...s, ...a.presence, run: a.run };
    case 'presence':
      // Keep-alives repeat the same values every 15 s: returning the same state skips a re-render.
      return samePresence(s, a.presence) ? s : { ...s, ...a.presence };
    case 'connection':
      // A goodbye sticks through the retries that follow it; only a newly proven, connected
      // stream ('live', sent by the follow loop) lifts it.
      if (s.connection.kind === 'ended' && a.connection.kind !== 'live') return s;
      return { ...s, connection: a.connection };
  }
}

/** How long reconnecting may fail before the page says the session is lost. */
export const LOST_AFTER_MS = 15_000;

/** How long after Claude's last tool call the page still says it is working. */
export const ACTIVE_FOR_MS = 60_000;
