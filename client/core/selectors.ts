/** Derived facts the views share. Pure. */
import type { Item, Message, RunState } from '../../shared/contract.ts';
import type { PageState } from './state.ts';

export const openQuestions = (item: Item) => item.questions.filter((q) => !q.answer);

export type ItemStatus = 'questions' | 'ready' | 'approved' | 'done' | 'rejected' | 'pending';

/** A verdict counts only when it names the item's current revision. */
export function itemStatus(item: Item): ItemStatus {
  if (openQuestions(item).length) return 'questions';
  const v = item.verdict && item.verdict.rev === item.rev ? item.verdict.value : undefined;
  if (v === 'approved') return item.done ? 'done' : 'approved';
  if (v === 'rejected' || v === 'pending') return v;
  return 'ready';
}

/** Things waiting on the user: open questions plus items ready for a verdict. */
export function waitingCount(run: RunState): number {
  return run.items.reduce((n, i) => n + openQuestions(i).length + (itemStatus(i) === 'ready' ? 1 : 0), 0);
}

export type Turn = 'yours' | 'working' | 'done' | 'offline';

export function turn(s: PageState): Turn {
  if (!s.run) return 'working';
  if (s.run.status !== 'open') return 'done';
  if (s.connection.kind === 'ended' || s.connection.kind === 'lost' || s.connection.kind === 'moved') return 'offline';
  return s.waiting ? 'yours' : 'working';
}

/** `<turn> <project> · <skill> · <subject>`, at most 60 characters. */
export function tabTitle(s: PageState, sameSubjectStart?: string): string {
  const run = s.run;
  if (!run) return 'Workbench';
  const t = turn(s);
  const prefix = t === 'working' ? '… ' : t === 'done' ? (run.status === 'paused' ? '⏸ ' : '✓ ') : t === 'offline' ? '○ ' : `(${waitingCount(run)}) `;
  const time = sameSubjectStart ? ` · ${sameSubjectStart}` : '';
  const title = `${prefix}${run.project} · ${run.skill} · ${run.subject}${time}`;
  return title.length > 60 ? `${title.slice(0, 59)}…` : title;
}

export const threadMessages = (run: RunState, threadId: string): Message[] => run.messages.filter((m) => m.threadId === threadId);

export function runThreadId(run: RunState): string | undefined {
  return run.threads.find((t) => t.owner.type === 'run')?.id;
}

export const itemTitle = (item: Item) => (typeof item.fields['title'] === 'string' ? (item.fields['title'] as string) : item.id);
