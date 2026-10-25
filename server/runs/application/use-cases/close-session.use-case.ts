import type { RunState } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { close } from '@server/common/domain/run.rules.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';

export interface CloseSessionInput {
  runId: string;
  status: 'closed' | 'paused';
  outcome: string;
}

/**
 * Ends a run. Refused while any item has no outcome; a run with items left
 * pending can only be paused, which keeps it resumable.
 */
export class CloseSessionUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly clock: Clock,
  ) {}

  execute(input: CloseSessionInput): Promise<RunState> {
    return this.runs.change(input.runId, (run) => {
      const closed = close(run, input.status, input.outcome, this.clock.now());
      return { run: closed, result: closed };
    });
  }
}
