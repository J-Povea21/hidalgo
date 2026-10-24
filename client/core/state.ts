/**
 * The page's state: what the server last sent, and how the connection is.
 * A pure reducer: the server's updates go in, the views read what comes out.
 */
import type { RunState } from '../../shared/contract.ts';

export type Connection =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'reconnecting'; since: number }
  /** The server that answered isn't this run's (another program took the port). */
  | { kind: 'moved' }
  /** The session said goodbye: it ended normally. */
  | { kind: 'ended'; reason: string }
  /** No goodbye and reconnecting keeps failing. */
  | { kind: 'lost' };

export interface PageState {
  run?: RunState;
  /** Whether Claude is holding wait_for_events: it's the user's turn. */
  waiting: boolean;
  connection: Connection;
  /** Events this page sent that the state hasn't reflected yet. */
  sending: number;
}

export type PageAction =
  | { type: 'state'; run: RunState; waiting: boolean }
  | { type: 'waiting'; waiting: boolean }
  | { type: 'connection'; connection: Connection }
  | { type: 'sent' }
  | { type: 'send-failed' };

export const initialState: PageState = { waiting: false, connection: { kind: 'connecting' }, sending: 0 };

export function reduce(s: PageState, a: PageAction): PageState {
  switch (a.type) {
    case 'state': {
      // Never go backwards: a late, older snapshot must not undo a newer one.
      if (s.run && a.run.id === s.run.id && a.run.version < s.run.version) return { ...s, waiting: a.waiting };
      return { ...s, run: a.run, waiting: a.waiting, sending: 0, connection: s.connection.kind === 'ended' ? s.connection : { kind: 'live' } };
    }
    case 'waiting':
      return { ...s, waiting: a.waiting };
    case 'connection':
      // A goodbye is final for this page; only a fresh state from a resumed run lifts it.
      if (s.connection.kind === 'ended' && a.connection.kind !== 'live') return s;
      return { ...s, connection: a.connection };
    case 'sent':
      return { ...s, sending: s.sending + 1 };
    case 'send-failed':
      return { ...s, sending: Math.max(0, s.sending - 1) };
  }
}

/** How long reconnecting may fail before the page says the session is lost. */
export const LOST_AFTER_MS = 15_000;
