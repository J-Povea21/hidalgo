/**
 * Records that an approved item now exists outside the workbench (the ClickUp
 * card was created). Only an item approved at its current revision qualifies.
 */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { markDone } from '@server/common/domain/run.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';

export interface MarkDoneInput {
  runId: string;
  itemId: string;
  note: string;
}

export class MarkDoneUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly clock: Clock,
  ) {}

  execute(input: MarkDoneInput) {
    return this.runs.change(input.runId, (run) => ({
      run: markDone(run, input.itemId, input.note, this.clock.now()),
      result: {},
    }));
  }
}
