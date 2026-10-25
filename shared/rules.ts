/**
 * The rules every item and run obey, written once for both halves. Pure, and
 * importing only types, so the page can use it without pulling in a schema.
 */
import type { Item, Question, RunState, VerdictValue } from './contract.ts';

/** A verdict counts only when it names the item's current revision; any later change voids it. */
export const currentVerdict = (item: Item): VerdictValue | undefined =>
  item.verdict && item.verdict.rev === item.rev ? item.verdict.value : undefined;

export const openQuestions = (item: Item): Question[] => item.questions.filter((question) => !question.answer);

/** Final: rejected, or approved and done outside the workbench. Only then may a run close. */
export function isFinal(item: Item): boolean {
  const verdict = currentVerdict(item);
  return verdict === 'rejected' || (verdict === 'approved' && !!item.done);
}

export type ItemStatus = 'questions' | 'ready' | 'approved' | 'done' | 'rejected' | 'pending';

export function itemStatus(item: Item): ItemStatus {
  if (openQuestions(item).length) return 'questions';
  const verdict = currentVerdict(item);
  if (verdict === 'approved') return item.done ? 'done' : 'approved';
  return verdict ?? 'ready';
}

/** Things waiting on the user: open questions, plus items ready for a verdict. */
export const pendingForUser = (run: RunState): number =>
  run.items.reduce((total, item) => total + openQuestions(item).length + (itemStatus(item) === 'ready' ? 1 : 0), 0);

export const runThreadId = (run: RunState): string | undefined =>
  run.threads.find((thread) => thread.owner.type === 'run')?.id;

/** Every kind has a title (ItemKinds requires it). */
export const itemTitle = (item: Item): string => item.fields.title;
