/** The items on a run's page: what Claude adds, changes, asks about and marks done. */
import type { RunChanges } from '@server/common/application/run-changes.ts';
import type { Clock } from '@server/common/ports/clock.port.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';
import { AddItemsUseCase } from '@server/items/application/use-cases/add-items.use-case.ts';
import { AskUseCase } from '@server/items/application/use-cases/ask.use-case.ts';
import { MarkDoneUseCase } from '@server/items/application/use-cases/mark-done.use-case.ts';
import { UpdateItemUseCase } from '@server/items/application/use-cases/update-item.use-case.ts';

export interface ItemsModule {
  addItems: AddItemsUseCase;
  updateItem: UpdateItemUseCase;
  ask: AskUseCase;
  markDone: MarkDoneUseCase;
}

export function itemsModule(adapters: { runs: RunChanges; ids: Ids; clock: Clock }): ItemsModule {
  return {
    addItems: new AddItemsUseCase(adapters.runs, adapters.ids),
    updateItem: new UpdateItemUseCase(adapters.runs),
    ask: new AskUseCase(adapters.runs, adapters.ids),
    markDone: new MarkDoneUseCase(adapters.runs, adapters.clock),
  };
}
