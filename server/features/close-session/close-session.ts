/**
 * Ends a run. Refused while any item has no outcome; a run with items left
 * pending can only be paused, which keeps it resumable.
 */
import type { Clock } from '@server/kernel/ports.ts';
import { close } from '@server/kernel/run.ts';
import { changeRun, type RunDeps } from '@server/kernel/unit-of-work.ts';

export function closeSession(
  deps: RunDeps & { clock: Clock },
  input: { runId: string; status: 'closed' | 'paused'; outcome: string },
) {
  return changeRun(deps, input.runId, (run) => ({
    run: close(run, input.status, input.outcome, deps.clock.now()),
    result: { status: input.status },
  }));
}
