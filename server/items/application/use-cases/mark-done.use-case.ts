import type { Item } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { markDone } from '@server/common/domain/item.rules.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';

export interface MarkDoneInput {
  runId: string;
  itemId: string;
  note: string;
}

/**
 * Records that an approved item now exists outside Hidalgo (the card was
 * created in the tracker). Only an item approved at its current revision qualifies.
 */
export class MarkDoneUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly clock: Clock,
  ) {}

  execute(input: MarkDoneInput): Promise<Item> {
    return this.runs.change(input.runId, (run) => {
      const { run: next, item } = markDone(run, input.itemId, input.note, this.clock.now());
      return { run: next, result: item };
    });
  }
}
