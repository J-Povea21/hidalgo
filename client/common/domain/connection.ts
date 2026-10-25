/** How the page stands with Claude's session, as the live feed reports it. */

/** How long reconnecting may fail before the page says the session is lost. */
export const LOST_AFTER_MS = 15_000;

export const CONNECTION = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'reconnecting',
  /** Something that isn't this run's server answered on the port. */
  moved: 'moved',
  /** The real server answered on a newer build: this page must be reloaded. */
  stale: 'stale',
  /** The session said goodbye. */
  ended: 'ended',
  /** No goodbye, and reconnecting kept failing. */
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
