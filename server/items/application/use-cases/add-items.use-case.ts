import type { Item } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { addItems, type NewItem } from '@server/common/domain/item.rules.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';

export interface AddItemsInput {
  runId: string;
  items: NewItem[];
}

/** Adds items in one call; each is checked against its kind's schema first, and one failure adds none. */
export class AddItemsUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
  ) {}

  execute(input: AddItemsInput): Promise<Item[]> {
    return this.runs.change(input.runId, (run) => {
      const { run: next, added } = addItems(run, input.items, (prefix) => this.ids.next(prefix));
      return { run: next, result: added };
    });
  }
}
