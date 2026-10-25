/**
 * The rules every item and run obey, written once for both halves. Pure, and
 * importing only types, so the page can use it without pulling in a schema.
 */
import type { Item, Question, RunState } from './contract.ts';
import { ITEM_STATUS, type ItemStatus, VERDICT, type VerdictValue } from './values.ts';

export { ITEM_STATUS, type ItemStatus } from './values.ts';

/** A verdict counts only when it names the item's current revision; any later change voids it. */
export const currentVerdict = (item: Item): VerdictValue | undefined =>
  item.verdict && item.verdict.rev === item.rev ? item.verdict.value : undefined;

export const openQuestions = (item: Item): Question[] => item.questions.filter((question) => !question.answer);

/** Final: rejected, or approved and done outside the workbench. Only then may a run close. */
export function isFinal(item: Item): boolean {
  const verdict = currentVerdict(item);
  return verdict === VERDICT.rejected || (verdict === VERDICT.approved && !!item.done);
}

export function itemStatus(item: Item): ItemStatus {
  if (openQuestions(item).length) return ITEM_STATUS.questions;
  const verdict = currentVerdict(item);
  if (verdict === VERDICT.approved) return item.done ? ITEM_STATUS.done : ITEM_STATUS.approved;
  return verdict ?? ITEM_STATUS.ready;
}

/** Things waiting on the user: open questions, plus items ready for a verdict. */
export const pendingForUser = (run: RunState): number =>
  run.items.reduce(
    (total, item) => total + openQuestions(item).length + (itemStatus(item) === ITEM_STATUS.ready ? 1 : 0),
    0,
  );

export const runThreadId = (run: RunState): string | undefined =>
  run.threads.find((thread) => thread.owner.type === 'run')?.id;

/** Every kind has a title (ItemKinds requires it). */
export const itemTitle = (item: Item): string => item.fields.title;
