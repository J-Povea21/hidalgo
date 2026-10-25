/** Applies a patch to an item. The new revision voids any approval of the old one. */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { updateItem } from '@server/common/domain/run.ts';

export interface UpdateItemInput {
  runId: string;
  itemId: string;
  patch: unknown;
}

export class UpdateItemUseCase {
  constructor(private readonly runs: RunChanges) {}

  execute(input: UpdateItemInput) {
    return this.runs.change(input.runId, (run) => {
      const { run: next, rev } = updateItem(run, input.itemId, input.patch);
      return { run: next, result: { rev } };
    });
  }
}
