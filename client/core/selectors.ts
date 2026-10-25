/** What the page derives from its state. Item and run rules come from shared/rules, written once for both halves. */
import type { Message, RunState } from '../../shared/contract.ts';
import { pendingForUser } from '../../shared/rules.ts';
import { ACTIVE_FOR_MS, type PageState } from './state.ts';

export { itemStatus, itemTitle, openQuestions, runThreadId, type ItemStatus } from '../../shared/rules.ts';

/**
 * How the page presents whose turn it is (the run's own `turn` is just user or claude).
 * `working` is shown only while Claude has called a tool recently; past that, without a
 * wait in place, it is `idle`: Claude isn't listening, and the page says so.
 */
export type TurnView = 'yours' | 'working' | 'idle' | 'done' | 'offline';

const OFFLINE = new Set<PageState['connection']['kind']>(['ended', 'lost', 'moved', 'stale']);

export function turnView(s: PageState, now: number): TurnView {
  if (!s.run) return 'working';
  if (s.run.status !== 'open') return 'done';
  if (OFFLINE.has(s.connection.kind)) return 'offline';
  if (s.claudeListening) return 'yours';
  return s.claudeActiveAt !== null && now - s.claudeActiveAt < ACTIVE_FOR_MS ? 'working' : 'idle';
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
export function tabTitle(s: PageState, now: number): string {
  if (!s.run) return 'Workbench';
  const title = `${PREFIX[turnView(s, now)](s.run)}${s.run.project} · ${s.run.skill} · ${s.run.subject}`;
  return title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title;
}

export const threadMessages = (run: RunState, threadId: string): Message[] => run.messages.filter((m) => m.threadId === threadId);
