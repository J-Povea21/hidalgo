import type { Item } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { updateItem } from '@server/common/domain/item.rules.ts';

export interface UpdateItemInput {
  runId: string;
  itemId: string;
  patch: unknown;
}

/** Applies a patch to an item. The new revision voids any approval of the old one. */
export class UpdateItemUseCase {
  constructor(private readonly runs: RunChanges) {}

  execute(input: UpdateItemInput): Promise<Item> {
    return this.runs.change(input.runId, (run) => {
      const { run: next, item } = updateItem(run, input.itemId, input.patch);
      return { run: next, result: item };
    });
  }
}
