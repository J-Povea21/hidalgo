/**
 * Records that an approved item now exists outside the workbench (the ClickUp
 * card was created). Only an item approved at its current revision qualifies.
 */
import type { Clock } from '@server/kernel/ports.ts';
import { markDone as done } from '@server/kernel/run.ts';
import { changeRun, type RunDeps } from '@server/kernel/unit-of-work.ts';

export function markDone(deps: RunDeps & { clock: Clock }, input: { runId: string; itemId: string; note: string }) {
  return changeRun(deps, input.runId, (run) => ({ run: done(run, input.itemId, input.note, deps.clock.now()), result: {} }));
}
