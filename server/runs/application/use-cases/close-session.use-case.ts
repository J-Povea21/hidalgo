/**
 * Ends a run. Refused while any item has no outcome; a run with items left
 * pending can only be paused, which keeps it resumable.
 */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { close } from '@server/common/domain/run.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';

export interface CloseSessionInput {
  runId: string;
  status: 'closed' | 'paused';
  outcome: string;
}

export class CloseSessionUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly clock: Clock,
  ) {}

  execute(input: CloseSessionInput) {
    return this.runs.change(input.runId, (run) => ({
      run: close(run, input.status, input.outcome, this.clock.now()),
      result: { status: input.status },
    }));
  }
}
