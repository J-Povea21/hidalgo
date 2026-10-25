/** What the page derives from its state. Item and run rules come from shared/rules, written once for both halves. */
import type { Message, RunState } from '@shared/contract.ts';
import { pendingForUser } from '@shared/rules.ts';
import { ACTIVE_FOR_MS, CONNECTION, type PageState } from './state.ts';
import { RUN_STATUS } from '@shared/values.ts';

export { ITEM_STATUS, itemStatus, itemTitle, openQuestions, runThreadId, type ItemStatus } from '@shared/rules.ts';

const TITLE_MAX = 60;

/** Not talking to Claude's session right now, for whatever reason: nobody's turn can be shown. */
const OFFLINE = new Set<PageState['connection']['kind']>([
  CONNECTION.reconnecting,
  CONNECTION.ended,
  CONNECTION.lost,
  CONNECTION.moved,
  CONNECTION.stale,
]);

const PREFIX: Record<TurnView, (run: RunState) => string> = {
  yours: (run) => `(${pendingForUser(run)}) `,
  working: () => '… ',
  idle: () => '○ ',
  done: (run) => (run.status === RUN_STATUS.paused ? '⏸ ' : '✓ '),
  offline: () => '○ ',
};

/**
 * How the page presents whose turn it is (the run's own `turn` is just user or claude).
 * `working` is shown only while Claude has called a tool recently; past that, without a
 * wait in place, it is `idle`: Claude isn't listening, and the page says so.
 */
export const TURN_VIEW = {
  yours: 'yours',
  working: 'working',
  idle: 'idle',
  done: 'done',
  offline: 'offline',
} as const;
export type TurnView = (typeof TURN_VIEW)[keyof typeof TURN_VIEW];

export function turnView(state: PageState, now: number): TurnView {
  if (!state.run) {
    return TURN_VIEW.working;
  }
  if (state.run.status !== RUN_STATUS.open) {
    return TURN_VIEW.done;
  }
  if (OFFLINE.has(state.connection.kind)) {
    return TURN_VIEW.offline;
  }
  if (state.claudeListening) {
    return TURN_VIEW.yours;
  }
  const claudeCalledAToolRecently = state.claudeActiveAt !== null && now - state.claudeActiveAt < ACTIVE_FOR_MS;
  return claudeCalledAToolRecently ? TURN_VIEW.working : TURN_VIEW.idle;
}

/** `<turn> <project> · <skill> · <subject>`, at most 60 characters. */
export function tabTitle(state: PageState, now: number): string {
  if (!state.run) {
    return 'Workbench';
  }
  const title = `${PREFIX[turnView(state, now)](state.run)}${state.run.project} · ${state.run.skill} · ${state.run.subject}`;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

/**
 * What a thread shows while Claude works on what was just sent from it: its status line,
 * or "thinking". Only while Claude is actually working and the page is connected.
 */
export function typingIn(
  state: PageState,
  now: number,
  sentFrom: string | undefined,
  threadId: string,
): string | undefined {
  if (!state.run || sentFrom !== threadId || state.connection.kind !== CONNECTION.live) {
    return undefined;
  }
  if (turnView(state, now) !== TURN_VIEW.working) {
    return undefined;
  }
  return state.run.statusLine ? `Claude: ${state.run.statusLine}` : 'Claude is thinking…';
}

export function threadMessages(run: RunState, threadId: string): Message[] {
  return run.messages.filter((message) => message.threadId === threadId);
}
