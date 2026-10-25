/** The page's state, and the pure reducer the server's updates go through. */
import type { RunState } from '@shared/contract.ts';
import { CONNECTION, type Connection } from './connection.ts';

export { CONNECTION, LOST_AFTER_MS, type Connection, type ConnectionKind } from './connection.ts';

export interface PageState extends Presence {
  run?: RunState;
  connection: Connection;
}

/** How Claude is, sent with every state and keep-alive. */
export interface Presence {
  claudeListening: boolean;
  /** When Claude last called a tool on the run (ms since epoch); null if not since the server started. */
  claudeActiveAt: number | null;
}

/** How long after Claude's last tool call the page still says it is working. */
export const ACTIVE_FOR_MS = 60_000;

export function reduce(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case ACTION.state:
      return takeState(state, action.run, action.presence);
    case ACTION.presence:
      return takePresence(state, action.presence);
    case ACTION.connection:
      return takeConnection(state, action.connection);
  }
}

export const initialState: PageState = {
  claudeListening: false,
  claudeActiveAt: null,
  connection: { kind: CONNECTION.connecting },
};

/** What the server's updates become: `dispatch(actions.state(run, presence))`. */
export const actions = {
  state: (run: RunState, presence: Presence): PageAction => ({ type: ACTION.state, run, presence }),
  presence: (presence: Presence): PageAction => ({ type: ACTION.presence, presence }),
  connection: (connection: Connection): PageAction => ({ type: ACTION.connection, connection }),
};

export const ACTION = { state: 'state', presence: 'presence', connection: 'connection' } as const;

export type PageAction =
  | { type: typeof ACTION.state; run: RunState; presence: Presence }
  | { type: typeof ACTION.presence; presence: Presence }
  | { type: typeof ACTION.connection; connection: Connection };

function takeState(state: PageState, run: RunState, presence: Presence): PageState {
  // A late, older snapshot must not undo a newer one.
  const isOlderSnapshot = state.run !== undefined && run.id === state.run.id && run.version < state.run.version;
  if (isOlderSnapshot) {
    return takePresence(state, presence);
  }
  return { ...state, ...presence, run };
}

function takePresence(state: PageState, presence: Presence): PageState {
  // Keep-alives repeat the same values: returning the same state skips a re-render.
  const unchanged =
    state.claudeListening === presence.claudeListening && state.claudeActiveAt === presence.claudeActiveAt;
  return unchanged ? state : { ...state, ...presence };
}

function takeConnection(state: PageState, connection: Connection): PageState {
  // A goodbye sticks through the retries that follow it; only a live stream lifts it.
  const goodbyeStillStands = state.connection.kind === CONNECTION.ended && connection.kind !== CONNECTION.live;
  return goodbyeStillStands ? state : { ...state, connection };
}
