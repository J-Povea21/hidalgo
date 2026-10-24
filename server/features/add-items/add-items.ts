/** Adds items in one call; each is checked against its kind's schema first. */
import type { Ids } from '../../kernel/ports.ts';
import { addItems as add } from '../../kernel/run.ts';
import { changeRun, type RunDeps } from '../../kernel/unit-of-work.ts';

export interface NewItem { kind: string; fields: unknown; questions?: unknown[] | undefined }

export function addItems(deps: RunDeps & { ids: Ids }, input: { runId: string; items: NewItem[] }) {
  return changeRun(deps, input.runId, (run) => {
    const { run: next, added } = add(run, input.items, (p) => deps.ids.next(p));
    return { run: next, result: added };
  });
}
