/**
 * The page's state: what the server last sent, and how the connection is.
 * A pure reducer: the server's updates go in, the views read what comes out.
 */
import type { RunState } from '@shared/contract.ts';

export const CONNECTION = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'reconnecting',
  /** The server that answered isn't this run's (another program took the port). */
  moved: 'moved',
  /** A workbench of a newer build answered: this page predates an update and must be reloaded. */
  stale: 'stale',
  /** The session said goodbye: it ended normally. */
  ended: 'ended',
  /** No goodbye and reconnecting keeps failing. */
  lost: 'lost',
} as const;
export type ConnectionKind = (typeof CONNECTION)[keyof typeof CONNECTION];

export type Connection =
  | { kind: typeof CONNECTION.connecting }
  | { kind: typeof CONNECTION.live }
  | { kind: typeof CONNECTION.reconnecting; since: number }
  | { kind: typeof CONNECTION.moved }
  | { kind: typeof CONNECTION.stale }
  | { kind: typeof CONNECTION.ended; reason: string }
  | { kind: typeof CONNECTION.lost };

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

export const ACTION = { state: 'state', presence: 'presence', connection: 'connection' } as const;

export type PageAction =
  | { type: typeof ACTION.state; run: RunState; presence: Presence }
  | { type: typeof ACTION.presence; presence: Presence }
  | { type: typeof ACTION.connection; connection: Connection };

/** What the server's updates become: `dispatch(actions.state(run, presence))`. */
export const actions = {
  state: (run: RunState, presence: Presence): PageAction => ({ type: ACTION.state, run, presence }),
  presence: (presence: Presence): PageAction => ({ type: ACTION.presence, presence }),
  connection: (connection: Connection): PageAction => ({ type: ACTION.connection, connection }),
};

export const initialState: PageState = {
  claudeListening: false,
  claudeActiveAt: null,
  connection: { kind: CONNECTION.connecting },
};

const samePresence = (state: PageState, presence: Presence) =>
  state.claudeListening === presence.claudeListening && state.claudeActiveAt === presence.claudeActiveAt;

export function reduce(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case ACTION.state:
      // Never go backwards: a late, older snapshot must not undo a newer one.
      if (state.run && action.run.id === state.run.id && action.run.version < state.run.version)
        return samePresence(state, action.presence) ? state : { ...state, ...action.presence };
      return { ...state, ...action.presence, run: action.run };
    case ACTION.presence:
      // Keep-alives repeat the same values every 15 s: returning the same state skips a re-render.
      return samePresence(state, action.presence) ? state : { ...state, ...action.presence };
    case ACTION.connection:
      // A goodbye sticks through the retries that follow it; only a newly proven, connected
      // stream ('live', sent by the follow loop) lifts it.
      if (state.connection.kind === CONNECTION.ended && action.connection.kind !== CONNECTION.live) return state;
      return { ...state, connection: action.connection };
  }
}

/** How long reconnecting may fail before the page says the session is lost. */
export const LOST_AFTER_MS = 15_000;

/** How long after Claude's last tool call the page still says it is working. */
export const ACTIVE_FOR_MS = 60_000;
