import type { Item, Question } from '@shared/contract.ts';
import type { RunChanges } from '@server/common/application/run-changes.ts';
import { ask } from '@server/common/domain/item.rules.ts';
import type { Ids } from '@server/common/ports/ids.port.ts';

export interface AskInput {
  runId: string;
  itemId: string;
  questions: unknown[];
}

/** Puts questions in an item's carousel. Approve stays blocked until they're answered. */
export class AskUseCase {
  constructor(
    private readonly runs: RunChanges,
    private readonly ids: Ids,
  ) {}

  execute(input: AskInput): Promise<{ item: Item; asked: Question[] }> {
    return this.runs.change(input.runId, (run) => {
      const { run: next, item, asked } = ask(run, input.itemId, input.questions, (prefix) => this.ids.next(prefix));
      return { run: next, result: { item, asked } };
    });
  }
}
