/**
 * Load a run, change it, save it, show it, under the run's lock. Every use case
 * that changes a run goes through this, so "saved before shown" holds and two
 * changes can't overwrite each other. Uses ports only.
 */
import type { RunState } from '@shared/contract.ts';
import { WorkbenchError } from '@server/common/domain/errors.ts';
import type { PagePublisher } from '@server/common/ports/page-publisher.port.ts';
import type { RunLock } from '@server/common/ports/run-lock.port.ts';
import type { RunStore } from '@server/common/ports/run-store.port.ts';

export class RunChanges {
  constructor(
    private readonly store: RunStore,
    private readonly page: PagePublisher,
    private readonly lock: RunLock,
  ) {}

  /** The run as saved; a missing run is a not-found error, never undefined. */
  async load(runId: string): Promise<RunState> {
    const run = await this.store.load(runId);
    if (!run) {
      throw new WorkbenchError('not-found', `no run ${runId}`);
    }
    return run;
  }

  change<T>(runId: string, change: (run: RunState) => { run: RunState; result: T }): Promise<T> {
    return this.lock.exclusive(runId, async () => {
      const { run, result } = change(await this.load(runId));
      await this.store.save(run);
      this.page.publish(run);
      return result;
    });
  }
}
