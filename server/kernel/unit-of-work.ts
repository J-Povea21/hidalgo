/**
 * Load a run, change it, save it, show it, under the run's lock. Every slice
 * that changes a run goes through this, so "saved before shown" holds and two
 * changes can't overwrite each other. Uses ports only.
 */
import type { RunState } from '@shared/contract.ts';
import { WorkbenchError } from './errors.ts';
import type { PagePublisher, RunLock, RunStore } from './ports.ts';

export interface RunDeps {
  store: RunStore;
  page: PagePublisher;
  lock: RunLock;
}

export async function loadRun(store: RunStore, runId: string): Promise<RunState> {
  const run = await store.load(runId);
  if (!run) throw new WorkbenchError('not-found', `no run ${runId}`);
  return run;
}

export function changeRun<T>(
  deps: RunDeps,
  runId: string,
  change: (run: RunState) => { run: RunState; result: T },
): Promise<T> {
  return deps.lock.exclusive(runId, async () => {
    const { run, result } = change(await loadRun(deps.store, runId));
    await deps.store.save(run);
    deps.page.publish(run);
    return result;
  });
}
