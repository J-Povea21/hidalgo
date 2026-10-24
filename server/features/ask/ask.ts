/** Puts questions in an item's carousel. Approve stays blocked until they're answered. */
import type { Ids } from '../../kernel/ports.ts';
import { ask as addQuestions } from '../../kernel/run.ts';
import { changeRun, type RunDeps } from '../../kernel/unit-of-work.ts';

export function ask(deps: RunDeps & { ids: Ids }, input: { runId: string; itemId: string; questions: unknown[] }) {
  return changeRun(deps, input.runId, (run) => {
    const { run: next, questionIds, rev } = addQuestions(run, input.itemId, input.questions, (p) => deps.ids.next(p));
    return { run: next, result: { questionIds, rev } };
  });
}
