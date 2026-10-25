/** Applies a patch to an item. The new revision voids any approval of the old one. */
import { updateItem as update } from '@server/domain/run.ts';
import { changeRun, type RunDeps } from '@server/domain/unit-of-work.ts';

export function updateItem(deps: RunDeps, input: { runId: string; itemId: string; patch: unknown }) {
  return changeRun(deps, input.runId, (run) => {
    const { run: next, rev } = update(run, input.itemId, input.patch);
    return { run: next, result: { rev } };
  });
}
