/** What the page derives from its state. Item and run rules come from shared/rules, written once for both halves. */
import type { Message, RunState } from '@shared/contract.ts';
import { pendingForUser } from '@shared/rules.ts';
import { ACTIVE_FOR_MS, type PageState } from './state.ts';

export { itemStatus, itemTitle, openQuestions, runThreadId, type ItemStatus } from '@shared/rules.ts';

/**
 * How the page presents whose turn it is (the run's own `turn` is just user or claude).
 * `working` is shown only while Claude has called a tool recently; past that, without a
 * wait in place, it is `idle`: Claude isn't listening, and the page says so.
 */
export type TurnView = 'yours' | 'working' | 'idle' | 'done' | 'offline';

/** Not talking to Claude's session right now, for whatever reason: nobody's turn can be shown. */
const OFFLINE = new Set<PageState['connection']['kind']>(['reconnecting', 'ended', 'lost', 'moved', 'stale']);

export function turnView(state: PageState, now: number): TurnView {
  if (!state.run) return 'working';
  if (state.run.status !== 'open') return 'done';
  if (OFFLINE.has(state.connection.kind)) return 'offline';
  if (state.claudeListening) return 'yours';
  return state.claudeActiveAt !== null && now - state.claudeActiveAt < ACTIVE_FOR_MS ? 'working' : 'idle';
}

const PREFIX: Record<TurnView, (run: RunState) => string> = {
  yours: (run) => `(${pendingForUser(run)}) `,
  working: () => '… ',
  idle: () => '○ ',
  done: (run) => (run.status === 'paused' ? '⏸ ' : '✓ '),
  offline: () => '○ ',
};

const TITLE_MAX = 60;

/** `<turn> <project> · <skill> · <subject>`, at most 60 characters. */
export function tabTitle(state: PageState, now: number): string {
  if (!state.run) return 'Workbench';
  const title = `${PREFIX[turnView(state, now)](state.run)}${state.run.project} · ${state.run.skill} · ${state.run.subject}`;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

export const threadMessages = (run: RunState, threadId: string): Message[] =>
  run.messages.filter((message) => message.threadId === threadId);
