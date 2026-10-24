/**
 * Load a run, change it, save it, show it. Every slice that changes a run goes
 * through this, so "saved before shown" holds everywhere. Uses ports only.
 */
import type { RunState } from '../../shared/contract.ts';
import { WorkbenchError } from './errors.ts';
import type { PagePublisher, RunStore } from './ports.ts';

export interface RunDeps { store: RunStore; page: PagePublisher }

export async function loadRun(store: RunStore, runId: string): Promise<RunState> {
  const run = await store.load(runId);
  if (!run) throw new WorkbenchError('not-found', `no run ${runId}`);
  return run;
}

export async function changeRun<T>(
  deps: RunDeps,
  runId: string,
  change: (run: RunState) => { run: RunState; result: T },
): Promise<T> {
  const { run, result } = change(await loadRun(deps.store, runId));
  await deps.store.save(run);
  deps.page.publish(run);
  return result;
}
