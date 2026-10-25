/** Puts questions in an item's carousel. Approve stays blocked until they're answered. */
import type { Ids } from '@server/domain/ports.ts';
import { ask as addQuestions } from '@server/domain/run.ts';
import { changeRun, type RunDeps } from '@server/domain/unit-of-work.ts';

export function ask(deps: RunDeps & { ids: Ids }, input: { runId: string; itemId: string; questions: unknown[] }) {
  return changeRun(deps, input.runId, (run) => {
    const {
      run: next,
      questionIds,
      rev,
    } = addQuestions(run, input.itemId, input.questions, (prefix) => deps.ids.next(prefix));
    return { run: next, result: { questionIds, rev } };
  });
}
