/** Adds items in one call; each is checked against its kind's schema first. */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { addItems } from '@server/common/domain/run.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';

export interface NewItem {
  kind: string;
  fields: unknown;
  questions?: unknown[] | undefined;
}

export interface AddItemsInput {
  runId: string;
  items: NewItem[];
}

export class AddItemsUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
  ) {}

  execute(input: AddItemsInput) {
    return this.runs.change(input.runId, (run) => {
      const { run: next, added } = addItems(run, input.items, (prefix) => this.ids.next(prefix));
      return { run: next, result: added };
    });
  }
}
