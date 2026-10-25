/** The page's state, and the pure reducer the server's updates go through. */
import type { RunState } from '@shared/contract.ts';
import { CONNECTION, type Connection } from './connection.ts';

export { CONNECTION, LOST_AFTER_MS, type Connection, type ConnectionKind } from './connection.ts';

/** How long after Claude's last tool call the page still says it is working. */
export const ACTIVE_FOR_MS = 60_000;

export const ACTION = { state: 'state', claudeActivity: 'claudeActivity', connection: 'connection' } as const;

export const initialState: PageState = {
  claudeListening: false,
  claudeActiveAt: null,
  connection: { kind: CONNECTION.connecting },
};

/** What the server's updates become: `dispatch(actions.state(run, activity))`. */
export const actions = {
  state: (run: RunState, activity: ClaudeActivity): PageAction => ({ type: ACTION.state, run, activity }),
  claudeActivity: (activity: ClaudeActivity): PageAction => ({ type: ACTION.claudeActivity, activity }),
  connection: (connection: Connection): PageAction => ({ type: ACTION.connection, connection }),
};

export interface PageState extends ClaudeActivity {
  run?: RunState;
  connection: Connection;
}

/** How Claude is, sent with every state and keep-alive. */
export interface ClaudeActivity {
  claudeListening: boolean;
  /** When Claude last called a tool on the run (ms since epoch); null if not since the server started. */
  claudeActiveAt: number | null;
}

export type PageAction =
  | { type: typeof ACTION.state; run: RunState; activity: ClaudeActivity }
  | { type: typeof ACTION.claudeActivity; activity: ClaudeActivity }
  | { type: typeof ACTION.connection; connection: Connection };

export function reduce(state: PageState, action: PageAction): PageState {
  switch (action.type) {
    case ACTION.state:
      return takeState(state, action.run, action.activity);
    case ACTION.claudeActivity:
      return takeClaudeActivity(state, action.activity);
    case ACTION.connection:
      return takeConnection(state, action.connection);
  }
}

function takeState(state: PageState, run: RunState, activity: ClaudeActivity): PageState {
  // A late, older snapshot must not undo a newer one.
  const isOlderSnapshot = state.run !== undefined && run.id === state.run.id && run.version < state.run.version;
  if (isOlderSnapshot) {
    return takeClaudeActivity(state, activity);
  }
  return { ...state, ...activity, run };
}

function takeClaudeActivity(state: PageState, activity: ClaudeActivity): PageState {
  // Keep-alives repeat the same values: returning the same state skips a re-render.
  const unchanged =
    state.claudeListening === activity.claudeListening && state.claudeActiveAt === activity.claudeActiveAt;
  return unchanged ? state : { ...state, ...activity };
}

function takeConnection(state: PageState, connection: Connection): PageState {
  // A goodbye sticks through the retries that follow it; only a live stream lifts it.
  const goodbyeStillStands = state.connection.kind === CONNECTION.ended && connection.kind !== CONNECTION.live;
  return goodbyeStillStands ? state : { ...state, connection };
}
