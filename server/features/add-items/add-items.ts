/** Adds items in one call; each is checked against its kind's schema first. */
import type { Ids } from '@server/kernel/ports.ts';
import { addItems as add } from '@server/kernel/run.ts';
import { changeRun, type RunDeps } from '@server/kernel/unit-of-work.ts';

export interface NewItem {
  kind: string;
  fields: unknown;
  questions?: unknown[] | undefined;
}

export function addItems(deps: RunDeps & { ids: Ids }, input: { runId: string; items: NewItem[] }) {
  return changeRun(deps, input.runId, (run) => {
    const { run: next, added } = add(run, input.items, (prefix) => deps.ids.next(prefix));
    return { run: next, result: added };
  });
}
